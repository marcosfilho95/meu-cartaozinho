import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  PiggyBank,
  Plus,
  ReceiptText,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { SmartAddDialog } from "@/components/finance/SmartAddDialog";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { getMonthlySpendingGoal } from "@/lib/financeBudget";
import { buildFinancialPlan, fetchFinancialRuleVersions, type FinancialRuleVersion } from "@/lib/financialRules";
import {
  fetchExpectedBillsForMonth,
  finalizeFixedBillsForMonth,
  generateExpectedBillsForMonth,
  type FixedBillPreview,
} from "@/lib/finance/fixedBills";
import { syncCartaozinhoIncomeMonth } from "@/lib/finance/cartaozinhoSync";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { buildCategoryTrends, buildInsights, compareMonths, monthTitle, summarizeMonth } from "@/lib/financeInsights";
import { calculateAccountBalanceEffect, calculateReserveMovement, type GoalMovement } from "@/lib/financeOverview";
import { fetchFinanceTransactions, monthKey, type FinanceTx } from "@/lib/financeShared";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { getTransactionCompetenceMonth, shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";
import { cn } from "@/lib/utils";
import { emitFinanceSync, subscribeFinanceSync } from "@/lib/financeSyncBus";

interface MonthlyClosingPageProps {
  userId: string;
}

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_target?: number | null;
};

type ClosingSnapshot = {
  transactions: FinanceTx[];
  fixedBills: FixedBillPreview[];
  includedFixed: string[];
  goals: Goal[];
  goalMovements: GoalMovement[];
  legacySpendingGoal: number;
  financialRules: FinancialRuleVersion[];
};

const cacheKey = (userId: string, month: string) => `closing:${userId}:${month}`;

const STEPS = [
  { title: "Receitas", subtitle: "Quanto entrou", icon: CircleDollarSign },
  { title: "Gastos", subtitle: "Faturas e despesas", icon: ReceiptText },
  { title: "Planos", subtitle: "Quanto guardar", icon: PiggyBank },
  { title: "Resultado", subtitle: "Entenda o mês", icon: Target },
];

const isValidMonth = (value: string | null): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

const transactionLabel = (transaction: FinanceTx) => transaction.source || transaction.categories?.name || "Valor sem descrição";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Formata "YYYY-MM-DD" como "21 ago · sex", sem depender do fuso do navegador. */
const formatTransactionDate = (value?: string | null) => {
  if (!value || typeof value !== "string") return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[month - 1]} · ${weekday}`;
};


const MonthlyClosingPage: React.FC<MonthlyClosingPageProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMonth = isValidMonth(searchParams.get("mes")) ? searchParams.get("mes")! : monthKey(new Date());
  const [refMonth, setRefMonth] = useState(initialMonth);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [fixedBills, setFixedBills] = useState<FixedBillPreview[]>([]);
  const [includedFixed, setIncludedFixed] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>([]);
  const [legacySpendingGoal, setLegacySpendingGoal] = useState(0);
  const [financialRules, setFinancialRules] = useState<FinancialRuleVersion[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const applyCache = useCallback((snapshot: ClosingSnapshot) => {
    setTransactions(snapshot.transactions);
    setFixedBills(snapshot.fixedBills);
    setIncludedFixed(new Set(snapshot.includedFixed));
    setGoals(snapshot.goals);
    setGoalMovements(snapshot.goalMovements);
    setLegacySpendingGoal(snapshot.legacySpendingGoal);
    setFinancialRules(snapshot.financialRules);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sincronizações de escrita rodam em paralelo, sem bloquear a primeira pintura.
      const syncing = (async () => {
        await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
        await Promise.allSettled([
          syncCartaozinhoIncomeMonth(userId, refMonth),
          generateExpectedBillsForMonth(userId, refMonth),
        ]);
      })();

      const readAll = async () => {
        const [loadedTransactions, loadedBills, goalsRes, goalTxRes, budgetsRes, loadedRules] = await Promise.all([
          fetchFinanceTransactions(userId, 24),
          fetchExpectedBillsForMonth(userId, refMonth),
          supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
          untypedSupabase.from("goal_transactions").select("amount, type, created_at").eq("user_id", userId).limit(1000),
          supabase.from("budgets").select("category_id, limit_amount").eq("user_id", userId).eq("ref_month", refMonth),
          fetchFinancialRuleVersions(userId, refMonth),
        ]);
        if (goalsRes.error) throw goalsRes.error;
        if (goalTxRes.error) throw goalTxRes.error;
        if (budgetsRes.error) throw budgetsRes.error;

        const snapshot: ClosingSnapshot = {
          transactions: loadedTransactions,
          fixedBills: loadedBills,
          includedFixed: loadedBills
            .filter((bill) => !["ignored", "canceled"].includes(bill.status))
            .map((bill) => bill.id),
          goals: ((goalsRes.data || []) as unknown) as Goal[],
          goalMovements: (goalTxRes.data || []) as GoalMovement[],
          legacySpendingGoal: getMonthlySpendingGoal(budgetsRes.data || []),
          financialRules: loadedRules,
        };
        applyCache(snapshot);
        setFinanceViewCache(cacheKey(userId, refMonth), snapshot);
      };

      await readAll();
      setLoading(false);
      setHasLoaded(true);
      // Depois das sincronizações, recarrega silenciosamente para refletir novos registros.
      await syncing;
      await readAll().catch(() => undefined);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível preparar a revisão mensal."));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [applyCache, refMonth, userId]);

  useEffect(() => {
    const cached = getFinanceViewCache<ClosingSnapshot>(cacheKey(userId, refMonth));
    if (cached) {
      applyCache(cached);
      setHasLoaded(true);
    }
  }, [applyCache, refMonth, userId]);

  useEffect(() => { void load(); }, [load]);


  useEffect(() => {
    setSearchParams({ mes: refMonth }, { replace: true });
    setStep(0);
  }, [refMonth, setSearchParams]);

  useEffect(() => {
    return subscribeFinanceSync(() => void load());
  }, [load]);

  const monthTransactions = useMemo(() => transactions.filter((transaction) =>
    getTransactionCompetenceMonth(transaction) === refMonth &&
    transaction.status !== "canceled" &&
    shouldIncludeInRealizedCalculations(transaction),
  ), [refMonth, transactions]);
  const incomes = monthTransactions.filter((transaction) => transaction.type === "income");
  const expenses = monthTransactions.filter((transaction) => transaction.type === "expense");
  const baseSummary = useMemo(() => summarizeMonth(transactions, refMonth), [refMonth, transactions]);
  const fixedToCreate = fixedBills.filter((bill) => includedFixed.has(bill.id) && !bill.transactionId);
  const fixedExtra = fixedToCreate.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const closingSummary = useMemo(() => ({
    ...baseSummary,
    expenses: baseSummary.expenses + fixedExtra,
    result: baseSummary.result - fixedExtra,
    fixedExpenses: baseSummary.fixedExpenses + fixedExtra,
    committedRate: baseSummary.income > 0 ? ((baseSummary.expenses + fixedExtra) / baseSummary.income) * 100 : 0,
    savingsRate: baseSummary.income > 0 ? ((baseSummary.result - fixedExtra) / baseSummary.income) * 100 : 0,
    hasData: baseSummary.hasData || fixedExtra > 0,
  }), [baseSummary, fixedExtra]);
  const financialPlan = useMemo(
    () => buildFinancialPlan(financialRules, refMonth, closingSummary.income, legacySpendingGoal),
    [closingSummary.income, financialRules, legacySpendingGoal, refMonth],
  );
  const spendingGoal = financialPlan.spendingLimit;

  const reserve = useMemo(() => calculateReserveMovement(goalMovements, refMonth), [goalMovements, refMonth]);
  const reservedForPlans = Math.max(reserve.net, 0);
  const insights = useMemo(() => buildInsights({
    refMonth,
    summary: closingSummary,
    comparison: compareMonths(transactions, refMonth),
    categoryTrends: buildCategoryTrends(transactions, refMonth),
    spendingGoal: spendingGoal || null,
    reservedForPlans,
  }), [closingSummary, refMonth, reservedForPlans, spendingGoal, transactions]);

  const toggleFixed = (billId: string) => {
    setIncludedFixed((current) => {
      const next = new Set(current);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const removeTransaction = async (transaction: FinanceTx) => {
    if (transaction.external_id?.startsWith("meu_cartaozinho:")) {
      toast.info("Essa receita é atualizada automaticamente pelo Meu Cartãozinho.");
      return;
    }
    if (!window.confirm(`Excluir “${transactionLabel(transaction)}” de ${monthTitle(refMonth)}?`)) return;

    setDeletingId(transaction.id);
    try {
      const balanceEffect = calculateAccountBalanceEffect(transaction);
      let account: { id: string; current_balance: number | null } | null = null;
      if (Math.abs(balanceEffect) > 0.001 && transaction.account_id) {
        const { data, error } = await supabase
          .from("accounts")
          .select("id, current_balance")
          .eq("id", transaction.account_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Conta do lançamento não encontrada.");
        account = data;
      }

      const deletedAt = new Date().toISOString();
      const { error: deleteError } = await supabase
        .from("transactions")
        .update({ deleted_at: deletedAt })
        .eq("id", transaction.id)
        .eq("user_id", userId);
      if (deleteError) throw deleteError;

      if (account && Math.abs(balanceEffect) > 0.001) {
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({ current_balance: Number(account.current_balance || 0) - balanceEffect })
          .eq("id", account.id)
          .eq("user_id", userId);
        if (balanceError) {
          await supabase.from("transactions").update({ deleted_at: null }).eq("id", transaction.id).eq("user_id", userId);
          throw balanceError;
        }
      }

      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      emitFinanceSync({ userId });
      toast.success("Lançamento removido.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o lançamento."));
    } finally {
      setDeletingId(null);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await finalizeFixedBillsForMonth(userId, refMonth, [...includedFixed]);
      await syncCartaozinhoIncomeMonth(userId, refMonth);
      emitFinanceSync({ userId });
      toast.success(`Revisão de ${monthTitle(refMonth)} salva.`);
      navigate("/financas");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar a revisão."));
    } finally {
      setFinishing(false);
    }
  };

  const renderTransactions = (items: FinanceTx[], emptyText: string) => items.length === 0 ? (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
  ) : (
    <div className="space-y-2">{items.map((transaction) => (
      <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{transactionLabel(transaction)}</p><p className="truncate text-[11px] text-muted-foreground">{transaction.categories?.name || "Sem categoria"}{transaction.external_id?.startsWith("meu_cartaozinho:") ? " · integração automática" : ""}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <p className={cn("font-semibold tabular-nums", transaction.type === "income" ? "text-success" : "text-foreground")}>{formatCurrency(transaction.amount)}</p>
          {!transaction.external_id?.startsWith("meu_cartaozinho:") && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={`Excluir ${transactionLabel(transaction)}`}
              aria-label={`Excluir ${transactionLabel(transaction)}`}
              disabled={deletingId === transaction.id}
              onClick={() => void removeTransaction(transaction)}
            >
              {deletingId === transaction.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    ))}</div>
  );

  if (loading && !hasLoaded) {
    return <div className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Card className="border-primary/20 shadow-card"><CardContent className="flex min-h-52 flex-col items-center justify-center p-8 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><h1 className="mt-4 font-heading text-xl font-bold">Preparando sua revisão mensal</h1><p className="mt-1 text-sm text-muted-foreground">Sincronizando lançamentos, despesas fixas e Cartãozinho de {monthTitle(refMonth)}.</p></CardContent></Card><Skeleton className="h-40 rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-10">
      {loading && <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/65 px-4 backdrop-blur-[2px]" role="status" aria-live="polite"><Card className="w-full max-w-sm border-primary/20 shadow-elevated"><CardContent className="flex flex-col items-center p-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-3 font-heading font-bold">Atualizando {monthTitle(refMonth)}</p><p className="mt-1 text-xs text-muted-foreground">Sincronizando lançamentos e preparando os valores do mês.</p></CardContent></Card></div>}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Revisão mensal</p><h1 className="mt-1 font-heading text-2xl font-bold">Confira o mês em poucos passos.</h1><p className="mt-1 text-sm text-muted-foreground">Nada fica bloqueado: você pode voltar e atualizar quando precisar.</p></div>
        <MonthNavigator currentMonth={refMonth} onMonthChange={(month) => { setLoading(true); setRefMonth(month); }} />
      </header>

      <Card className="border-primary/20 bg-primary/5"><CardContent className="p-4"><p className="text-sm font-medium">O que esta revisão faz?</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Confirma as despesas fixas escolhidas, atualiza o valor do Meu Cartãozinho e recalcula receitas, despesas e resultado. O mês continua editável depois de salvar.</p></CardContent></Card>

      <Card className="border-border/70 shadow-card"><CardContent className="p-3 sm:p-4"><div className="grid grid-cols-4 gap-1">{STEPS.map((item, index) => { const Icon = item.icon; const active = index === step; const done = index < step; return <button key={item.title} type="button" onClick={() => setStep(index)} className={cn("rounded-xl p-2 text-left transition sm:p-3", active ? "bg-primary text-primary-foreground" : done ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}><div className="flex items-center gap-2">{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}<span className="hidden text-xs font-semibold sm:inline">{item.title}</span></div><p className={cn("mt-1 hidden text-[10px] sm:block", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{item.subtitle}</p></button>; })}</div><Progress value={((step + 1) / STEPS.length) * 100} className="mt-3 h-1" /></CardContent></Card>

      {step === 0 && <Card className="border-border/70 shadow-card"><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Quanto entrou em {monthTitle(refMonth)}</h2><p className="text-xs text-muted-foreground">O total mensal do Cartãozinho entra automaticamente no mesmo mês.</p></div><Button size="sm" onClick={() => setManualOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Adicionar receita</Button></div>{renderTransactions(incomes, "Nenhuma receita registrada neste mês.")}<div className="flex items-center justify-between rounded-xl bg-success/10 p-3"><span className="text-sm font-medium text-success">Total de receitas</span><strong className="text-success">{formatCurrency(baseSummary.income)}</strong></div></CardContent></Card>}

      {step === 1 && <div className="space-y-4"><Card className="border-border/70 shadow-card"><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Faturas e outros gastos</h2><p className="text-xs text-muted-foreground">Adicione somente os totais que fazem sentido para sua organização.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setSmartOpen(true)}><Sparkles className="mr-1.5 h-4 w-4" /> Texto ou print</Button><Button size="sm" onClick={() => setManualOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Adicionar gasto</Button></div></div>{renderTransactions(expenses, "Nenhuma despesa variável registrada neste mês.")}</CardContent></Card>
        <Card className="border-border/70 shadow-card"><CardContent className="space-y-4 p-5"><div><h2 className="font-heading font-bold">Despesas fixas</h2><p className="text-xs text-muted-foreground">Marque o que deve entrar neste mês. Desmarcar ignora apenas esta revisão.</p></div>{fixedBills.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">Nenhuma despesa fixa cadastrada.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/financas/recorrencias")}>Criar despesa fixa</Button></div> : <div className="space-y-2">{fixedBills.map((bill) => <label key={bill.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3 transition hover:bg-muted/40"><Checkbox checked={includedFixed.has(bill.id)} onCheckedChange={() => toggleFixed(bill.id)} disabled={Boolean(bill.transactionId)} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{bill.name}</p><p className="text-[11px] text-muted-foreground">Dia {bill.dueDate.slice(8, 10)}{bill.transactionId ? " · já incluída" : ""}</p></div><strong className="text-sm">{formatCurrency(bill.amount)}</strong></label>)}</div>}<div className="flex justify-between rounded-xl bg-muted/60 p-3 text-sm"><span>Fixos selecionados</span><strong>{formatCurrency(fixedBills.filter((bill) => includedFixed.has(bill.id)).reduce((sum, bill) => sum + bill.amount, 0))}</strong></div></CardContent></Card></div>}

      {step === 2 && <Card className="border-border/70 shadow-card"><CardContent className="space-y-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Seus planos</h2><p className="text-xs text-muted-foreground">Veja quanto já foi reservado e ajuste seus cofrinhos quando quiser.</p></div><Button onClick={() => navigate("/financas/cofrinhos")}><PiggyBank className="mr-1.5 h-4 w-4" /> Gerenciar planos</Button></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-primary p-4 text-primary-foreground"><p className="text-[10px] uppercase tracking-[0.14em] text-primary-foreground/65">Reservado no mês</p><p className="mt-2 text-2xl font-bold">{formatCurrency(reservedForPlans)}</p><p className="mt-1 text-xs text-primary-foreground/70">Transferências para seus objetivos não contam como despesa.</p></div><div className="rounded-2xl border border-border/70 p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Sobra antes dos planos</p><p className={cn("mt-2 text-2xl font-bold", closingSummary.result >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(closingSummary.result)}</p><p className="mt-1 text-xs text-muted-foreground">Use esse valor como referência, sem obrigação de guardar tudo.</p></div></div>{goals.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">Você ainda não criou nenhum plano.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/financas/cofrinhos")}>Criar primeiro plano</Button></div> : <div className="space-y-2">{goals.slice(0, 4).map((goal) => { const hasFinalTarget = Number(goal.target_amount) > 0; const progress = hasFinalTarget ? Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100) : 0; const monthlyPlan = financialPlan.goalAmounts.get(goal.id) ?? Number(goal.monthly_target || 0); return <div key={goal.id} className="rounded-xl border border-border/70 p-3"><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{goal.name}</span><strong>{hasFinalTarget ? `${progress.toFixed(0)}%` : "Destino contínuo"}</strong></div>{hasFinalTarget && <Progress value={progress} className="mt-2 h-2" />}<div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"><span>{hasFinalTarget ? `${formatCurrency(goal.current_amount)} de ${formatCurrency(goal.target_amount)}` : `${formatCurrency(goal.current_amount)} separados até agora`}</span>{monthlyPlan > 0 && <strong className="text-primary">Planejado no mês: {formatCurrency(monthlyPlan)}</strong>}</div></div>; })}</div>}</CardContent></Card>}

      {step === 3 && <div className="space-y-4"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Receitas", closingSummary.income, "text-success"],
        ["Despesas", closingSummary.expenses, "text-foreground"],
        ["Resultado", closingSummary.result, closingSummary.result >= 0 ? "text-success" : "text-destructive"],
        ["Para planos", reservedForPlans, "text-primary"],
      ].map(([label, value, tone]) => <Card key={String(label)} className="border-border/70 shadow-card"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={cn("mt-2 text-xl font-bold", String(tone))}>{formatCurrency(Number(value))}</p></CardContent></Card>)}</section><Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-card"><CardContent className="space-y-3 p-5"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-heading font-bold">O que este mês mostra</h2></div>{insights.map((insight) => <div key={insight.id} className="rounded-xl border border-border/70 bg-card p-3 text-sm leading-relaxed">{insight.text}</div>)}<div className="grid gap-2 pt-2 text-xs sm:grid-cols-3"><div className="rounded-xl bg-muted/60 p-3"><span className="text-muted-foreground">Renda comprometida</span><p className="mt-1 font-bold">{closingSummary.committedRate.toFixed(0)}%</p></div><div className="rounded-xl bg-muted/60 p-3"><span className="text-muted-foreground">Taxa de economia</span><p className="mt-1 font-bold">{closingSummary.savingsRate.toFixed(0)}%</p></div><div className="rounded-xl bg-muted/60 p-3"><span className="text-muted-foreground">Meta de gastos</span><p className="mt-1 font-bold">{spendingGoal > 0 ? formatCurrency(spendingGoal) : "Não definida"}</p></div></div></CardContent></Card><Card className="border-success/20 bg-success/5"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 text-success" /><div><h2 className="font-heading font-bold">Tudo pronto para salvar</h2><p className="text-sm text-muted-foreground">As contas fixas selecionadas serão incluídas sem duplicar valores existentes. Você poderá revisar novamente depois.</p></div></div><Button size="lg" onClick={finish} disabled={finishing}>{finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Salvar revisão <Check className="ml-2 h-4 w-4" /></>}</Button></CardContent></Card></div>}

      <div className="flex items-center justify-between gap-3"><Button variant="ghost" onClick={() => step === 0 ? navigate("/financas") : setStep((current) => current - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> {step === 0 ? "Voltar" : "Etapa anterior"}</Button>{step < STEPS.length - 1 && <Button onClick={() => setStep((current) => current + 1)}>Continuar <ArrowRight className="ml-2 h-4 w-4" /></Button>}</div>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} defaultType={step === 0 ? "income" : "expense"} defaultDate={`${refMonth}-01`} onSaved={load} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </div>
  );
};

export default MonthlyClosingPage;
