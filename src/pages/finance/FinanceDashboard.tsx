import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CircleDollarSign,
  CreditCard,
  PiggyBank,
  Plus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { GoalsSection } from "@/components/finance/GoalsSection";
import { SmartAddDialog } from "@/components/finance/SmartAddDialog";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { syncCartaozinhoIncomeMonths } from "@/lib/finance/cartaozinhoSync";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import {
  buildCategoryTrends,
  buildInsights,
  compareMonths,
  groupSmallSlices,
  monthTitle,
  projectGoal,
  summarizeMonth,
  type Insight,
} from "@/lib/financeInsights";
import { calculateReserveMovement, getTransactionReferenceMonth, type GoalMovement } from "@/lib/financeOverview";
import { type PlanningGoal } from "@/lib/financePlanning";
import { addMonthsToKey, fetchFinanceTransactions, getLastMonthKeys, getMonthLabel, isBankCategory, monthKey, resolveBankCategoryColor, type FinanceTx } from "@/lib/financeShared";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { cn } from "@/lib/utils";

interface FinanceDashboardProps {
  userId: string;
}

type DashboardGoal = PlanningGoal & {
  id: string;
  goal_type?: string;
  priority?: number;
};

type DashboardAccount = {
  id: string;
  name: string;
  type: string;
  current_balance: number | null;
};

const chartTooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
};

const insightStyle: Record<Insight["tone"], string> = {
  positive: "border-success/20 bg-success/5 text-success",
  neutral: "border-border/70 bg-muted/30 text-foreground",
  attention: "border-warning/30 bg-warning/5 text-foreground",
};

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [referenceMonth, setReferenceMonth] = useState(() => monthKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>([]);
  const [spendingGoal, setSpendingGoal] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
      const syncMonths = Array.from({ length: 6 }, (_, index) => addMonthsToKey(referenceMonth, -index));
      await syncCartaozinhoIncomeMonths(userId, syncMonths);

      const [accountsRes, goalsRes, goalTxRes, budgetsRes, loadedTransactions] = await Promise.all([
        supabase.from("accounts").select("id, name, type, current_balance").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
        untypedSupabase.from("goal_transactions").select("amount, type, created_at").eq("user_id", userId).limit(1000),
        supabase.from("budgets").select("limit_amount").eq("user_id", userId).eq("ref_month", referenceMonth),
        fetchFinanceTransactions(userId, 24),
      ]);
      if (accountsRes.error) throw accountsRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (goalTxRes.error) throw goalTxRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      setAccounts((accountsRes.data || []) as DashboardAccount[]);
      setGoals((goalsRes.data || []) as DashboardGoal[]);
      setGoalMovements((goalTxRes.data || []) as GoalMovement[]);
      setTransactions(loadedTransactions);
      setSpendingGoal((budgetsRes.data || []).reduce((sum, budget) => sum + Number(budget.limit_amount || 0), 0));
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível carregar sua análise financeira."));
    } finally {
      setLoading(false);
    }
  }, [referenceMonth, userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onFinanceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) void load();
    };
    window.addEventListener("finance-sync-updated", onFinanceUpdate);
    return () => window.removeEventListener("finance-sync-updated", onFinanceUpdate);
  }, [load, userId]);

  const summary = useMemo(() => summarizeMonth(transactions, referenceMonth), [referenceMonth, transactions]);
  const previousSummary = useMemo(() => summarizeMonth(transactions, addMonthsToKey(referenceMonth, -1)), [referenceMonth, transactions]);
  const comparison = useMemo(() => compareMonths(transactions, referenceMonth), [referenceMonth, transactions]);
  const categoryTrends = useMemo(() => buildCategoryTrends(transactions, referenceMonth), [referenceMonth, transactions]);
  const reserveMovement = useMemo(() => calculateReserveMovement(goalMovements, referenceMonth), [goalMovements, referenceMonth]);
  const reservedForPlans = Math.max(reserveMovement.net, 0);

  const historyKeys = useMemo(() => {
    const [year, month] = referenceMonth.split("-").map(Number);
    return getLastMonthKeys(6, new Date(year, month - 1, 15));
  }, [referenceMonth]);
  const evolution = useMemo(() => historyKeys.map((key) => {
    const item = summarizeMonth(transactions, key);
    return { key, month: getMonthLabel(key), receitas: item.income, despesas: -item.expenses, resultado: item.result, economia: item.savingsRate };
  }), [historyKeys, transactions]);

  const categoryDistribution = useMemo(() => groupSmallSlices(
    categoryTrends.filter((item) => item.current > 0).map((item) => ({ name: item.name, value: item.current, color: item.color })),
  ), [categoryTrends]);
  const fixedVariable = [
    { name: "Fixos", value: summary.fixedExpenses, color: "hsl(var(--primary))" },
    { name: "Variáveis", value: summary.variableExpenses, color: "hsl(var(--accent))" },
  ].filter((item) => item.value > 0);
  const cardSpending = useMemo(() => {
    const grouped = new Map<string, { name: string; value: number; color: string }>();
    transactions.forEach((transaction) => {
      if (transaction.type !== "expense" || transaction.status === "canceled") return;
      if (getTransactionReferenceMonth(transaction) !== referenceMonth) return;
      const categoryName = transaction.categories?.name || "";
      const isCardAccount = transaction.accounts?.type === "credit_card" || transaction.payment_method === "credit";
      const name = isCardAccount
        ? transaction.accounts?.name || "Cartão de crédito"
        : isBankCategory(categoryName) ? categoryName : "";
      if (!name) return;
      const current = grouped.get(name) || {
        name,
        value: 0,
        color: resolveBankCategoryColor(name, "#0F766E"),
      };
      current.value += Number(transaction.amount || 0);
      grouped.set(name, current);
    });
    return [...grouped.values()].sort((first, second) => second.value - first.value);
  }, [referenceMonth, transactions]);
  const cardSpendingTotal = cardSpending.reduce((total, card) => total + card.value, 0);

  const averageReserve = useMemo(() => {
    const months = historyKeys.slice(-3);
    if (months.length === 0) return 0;
    return months.reduce((sum, key) => sum + Math.max(calculateReserveMovement(goalMovements, key).net, 0), 0) / months.length;
  }, [goalMovements, historyKeys]);
  const activeGoals = goals.filter((goal) => !goal.is_completed && Number(goal.target_amount) > Number(goal.current_amount));
  const goalProjections = useMemo(() => goals.map((goal) => projectGoal(
    goal,
    Number(goal.monthly_target || 0) || (activeGoals.length ? averageReserve / activeGoals.length : 0),
    referenceMonth,
  )), [activeGoals.length, averageReserve, goals, referenceMonth]);

  const insights = useMemo(() => buildInsights({
    refMonth: referenceMonth,
    summary,
    comparison,
    categoryTrends,
    spendingGoal: spendingGoal || null,
    reservedForPlans,
    goalProjections,
  }), [categoryTrends, comparison, goalProjections, referenceMonth, reservedForPlans, spendingGoal, summary]);

  const spendingProgress = spendingGoal > 0 ? (summary.expenses / spendingGoal) * 100 : 0;
  const remainingBudget = Math.max(spendingGoal - summary.expenses, 0);
  const metricCards = [
    { label: "Receitas", value: summary.income, icon: TrendingUp, tone: "text-success", helper: "Tudo que entrou no mês" },
    { label: "Despesas", value: summary.expenses, icon: TrendingDown, tone: "text-foreground", helper: `${summary.committedRate.toFixed(0)}% da renda` },
    { label: "Resultado", value: summary.result, icon: CircleDollarSign, tone: summary.result >= 0 ? "text-success" : "text-destructive", helper: "Receitas menos despesas" },
    { label: "Reservado", value: reservedForPlans, icon: PiggyBank, tone: "text-primary", helper: "Para seus planos" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-10">
      <header className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Organizador mensal</p><h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">Seu dinheiro, com contexto.</h1><p className="mt-1 text-sm text-muted-foreground">Compare, ajuste e planeje o próximo passo sem transformar finanças em tarefa diária.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <MonthNavigator currentMonth={referenceMonth} onMonthChange={setReferenceMonth} />
          <Button onClick={() => navigate(`/financas/fechamento?mes=${referenceMonth}`)} className="gap-2"><BarChart3 className="h-4 w-4" /> Fechar mês</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Adicionar valor</Button>
        <Button variant="outline" size="sm" onClick={() => setSmartOpen(true)}><Sparkles className="mr-1.5 h-4 w-4" /> Texto ou print</Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("/financas/orcamento")}><Target className="mr-1.5 h-4 w-4" /> {spendingGoal > 0 ? "Ajustar meta" : "Definir meta"}</Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div>
      ) : !summary.hasData ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-elevated"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><Badge variant="outline">{monthTitle(referenceMonth)}</Badge><h2 className="mt-3 font-heading text-xl font-bold">Este mês ainda está em branco</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Faça o fechamento para incluir renda, faturas, gastos fixos e valores destinados aos seus planos.</p></div><Button size="lg" onClick={() => navigate(`/financas/fechamento?mes=${referenceMonth}`)}>Começar fechamento <ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map(({ label, value, icon: Icon, tone, helper }) => <Card key={label} className="border-border/70 shadow-card"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", tone)} /></div><p className={cn("mt-3 text-2xl font-bold tabular-nums", tone)}>{formatCurrency(value)}</p><p className="mt-1 text-[11px] text-muted-foreground">{helper}</p></CardContent></Card>)}
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-card">
          <CardContent className="flex h-full min-h-64 flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-heading font-bold">Comparado ao mês anterior</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{monthTitle(addMonthsToKey(referenceMonth, -1))}</p></div>
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
            </div>
            {previousSummary.hasData ? (
              <div className="mt-4 divide-y divide-border/60">
                {[
                  { label: "Gastos", value: comparison.expensesDelta, positive: comparison.expensesDelta <= 0 },
                  { label: "Receitas", value: comparison.incomeDelta, positive: comparison.incomeDelta >= 0 },
                  { label: "Sobra", value: comparison.resultDelta, positive: comparison.resultDelta >= 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={cn("text-sm font-bold tabular-nums", item.value === 0 ? "text-foreground" : item.positive ? "text-success" : "text-destructive")}>
                      {item.value > 0 ? "+" : item.value < 0 ? "−" : ""}{formatCurrency(Math.abs(item.value))}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="my-auto rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">Feche o mês anterior para comparar.</p>}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardContent className="h-full min-h-64 p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-heading font-bold">Evolução financeira</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Últimos seis meses</p></div><BarChart3 className="h-4 w-4 shrink-0 text-primary" /></div>
            <div className="mt-3 h-44"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={evolution} margin={{ top: 6, left: -30, right: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={9} /><YAxis axisLine={false} tickLine={false} fontSize={8} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number, name: string) => [formatCurrency(Math.abs(value)), name]} contentStyle={chartTooltipStyle} /><Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} /><Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" fillOpacity={0.72} radius={[0, 0, 3, 3]} /><Line dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardContent className="flex h-full min-h-64 flex-col p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-heading font-bold">Planejamento e orientações</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Meta e próximo passo</p></div><BrainCircuit className="h-4 w-4 shrink-0 text-primary" /></div>
            {spendingGoal > 0 ? <div className="mt-4"><div className="flex items-end justify-between gap-2"><div><p className="text-2xl font-bold tabular-nums">{Math.min(spendingProgress, 999).toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">da meta utilizada</p></div><strong className="text-xs tabular-nums">{formatCurrency(remainingBudget)} livres</strong></div><Progress value={Math.min(spendingProgress, 100)} className="mt-3 h-2" /></div> : <div className="mt-4 rounded-xl border border-dashed p-3"><p className="text-xs font-medium">Nenhuma meta definida</p><p className="mt-1 text-[10px] text-muted-foreground">Defina um limite mensal para acompanhar seus gastos.</p></div>}
            <p className={cn("mt-3 line-clamp-3 rounded-xl border p-2.5 text-xs leading-relaxed", insights[0] ? insightStyle[insights[0].tone] : insightStyle.neutral)}>{insights[0]?.text || "Continue registrando seus meses para receber orientações."}</p>
            <Button variant="link" size="sm" className="mt-auto h-auto justify-start px-0 pt-3 text-xs" onClick={() => navigate("/financas/orcamento")}>{spendingGoal > 0 ? "Ajustar planejamento" : "Criar meta"} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-card">
          <CardContent className="flex h-full min-h-64 flex-col p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-heading font-bold">Detalhe dos gastos</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Por cartão</p></div><CreditCard className="h-4 w-4 shrink-0 text-primary" /></div>
            {cardSpending.length ? <div className="mt-3 space-y-3">{cardSpending.slice(0, 3).map((item) => { const share = cardSpendingTotal > 0 ? item.value / cardSpendingTotal * 100 : 0; return <div key={item.name}><div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium">{item.name}</span><strong className="tabular-nums">{formatCurrency(item.value)}</strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: item.color }} /></div></div>; })}</div> : <div className="my-auto text-center"><CreditCard className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Nenhum gasto associado a cartão neste mês.</p></div>}
            <div className="mt-auto flex items-end justify-between gap-2 pt-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total nos cartões</p><p className="mt-0.5 font-bold tabular-nums">{formatCurrency(cardSpendingTotal)}</p></div><Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => navigate("/financas/transacoes")}>Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-2 px-1"><h2 className="font-heading text-lg font-bold">Ver mais detalhes</h2><p className="text-xs text-muted-foreground">Abra somente o que quiser analisar agora.</p></div>
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem value="breakdown" className="rounded-2xl border border-border/70 bg-card px-5 shadow-card">
            <AccordionTrigger className="py-4 text-left hover:no-underline"><span><span className="block font-heading font-bold">Análises complementares</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Categorias e divisão entre gastos fixos e variáveis.</span></span></AccordionTrigger>
            <AccordionContent className="border-t pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-4"><h3 className="font-heading font-bold">Por categoria</h3>{categoryDistribution.length ? <><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="75%" paddingAngle={2}>{categoryDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></div><div className="space-y-1.5">{categoryDistribution.slice(0, 5).map((item) => <div key={item.name} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}</div></> : <p className="py-12 text-center text-sm text-muted-foreground">Sem despesas classificadas.</p>}</div>
                <div className="rounded-xl border border-border/70 p-4"><h3 className="font-heading font-bold">Fixos x variáveis</h3>{fixedVariable.length ? <><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={fixedVariable} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="76%" paddingAngle={3}>{fixedVariable.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-2">{fixedVariable.map((item) => <div key={item.name} className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase text-muted-foreground">{item.name}</p><p className="mt-1 font-bold">{formatCurrency(item.value)}</p></div>)}</div></> : <p className="py-12 text-center text-sm text-muted-foreground">Sem comparação disponível.</p>}</div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="goals" className="rounded-2xl border border-border/70 bg-card px-5 shadow-card">
            <AccordionTrigger className="py-4 text-left hover:no-underline"><span><span className="block font-heading font-bold">Planos e cofrinhos</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Progresso dos seus sonhos e distribuição da sobra.</span></span></AccordionTrigger>
            <AccordionContent className="border-t pt-4">
              <div className="mb-3 flex justify-end"><Button variant="outline" size="sm" onClick={() => navigate("/financas/cofrinhos")}>Abrir página de planos <ArrowRight className="ml-1 h-4 w-4" /></Button></div>
              {goalProjections.length > 0 && <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{goalProjections.slice(0, 3).map((goal) => <Card key={goal.id} className="border-border/70"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="truncate font-semibold">{goal.name}</p><span className="text-xs font-bold text-primary">{goal.progress.toFixed(0)}%</span></div><Progress value={goal.progress} className="mt-3 h-2" /><div className="mt-3 flex justify-between text-[11px] text-muted-foreground"><span>{formatCurrency(goal.saved)} guardados</span><span>Faltam {formatCurrency(goal.missing)}</span></div></CardContent></Card>)}</div>}
              <GoalsSection userId={userId} goals={goals} accounts={accounts} monthlySurplus={Math.max(summary.result, 0)} allocatedThisMonth={reservedForPlans} refMonth={referenceMonth} onReload={load} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} defaultDate={`${referenceMonth}-01`} onSaved={load} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </div>
  );
};

export default FinanceDashboard;
