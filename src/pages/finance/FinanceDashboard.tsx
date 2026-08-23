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
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
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
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { syncCartaozinhoMonths } from "@/lib/finance/cartaozinhoSync";
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
      await syncCartaozinhoMonths(userId, syncMonths);

      const [accountsRes, goalsRes, goalTxRes, budgetsRes, loadedTransactions] = await Promise.all([
        supabase.from("accounts").select("id, name, type, current_balance").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
        untypedSupabase.from("goal_transactions").select("amount, type, ref_month, created_at").eq("user_id", userId).limit(1000),
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
    return { key, month: getMonthLabel(key), receitas: item.income, despesas: item.expenses, resultado: item.result, economia: item.savingsRate };
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

      <Card className="border-border/70 shadow-card">
        <CardContent className="p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-heading font-bold">Comparado ao mês anterior</h2><p className="text-xs text-muted-foreground">Quanto entrou, saiu e sobrou a mais ou a menos.</p></div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{monthTitle(addMonthsToKey(referenceMonth, -1))}</span>
          </div>
          {previousSummary.hasData ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { label: "Gastos", value: comparison.expensesDelta, positive: comparison.expensesDelta <= 0 },
                { label: "Receitas", value: comparison.incomeDelta, positive: comparison.incomeDelta >= 0 },
                { label: "Sobra", value: comparison.resultDelta, positive: comparison.resultDelta >= 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className={cn("mt-1 text-lg font-bold", item.value === 0 ? "text-foreground" : item.positive ? "text-success" : "text-destructive")}>{item.value > 0 ? "+" : item.value < 0 ? "−" : ""}{formatCurrency(Math.abs(item.value))}</p>
                  <p className="text-[10px] text-muted-foreground">{item.value === 0 ? "igual ao mês anterior" : `${item.label === "Gastos" && comparison.expensesDeltaPct !== 0 ? `${Math.abs(comparison.expensesDeltaPct).toFixed(0)}% · ` : ""}${item.value > 0 ? "a mais" : "a menos"}`}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Feche também o mês anterior para visualizar esta comparação.</p>}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><div><h2 className="font-heading font-bold">Receitas, despesas e resultado</h2><p className="text-xs text-muted-foreground">Evolução dos últimos seis meses.</p></div><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={evolution} margin={{ left: -18, right: 4 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} /><YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} /><Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" fillOpacity={0.72} radius={[4, 4, 0, 0]} /><Line dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.5} /></ComposedChart></ResponsiveContainer></div></CardContent></Card>

        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><div><h2 className="font-heading font-bold">Meta de gastos</h2><p className="text-xs text-muted-foreground">Limites definidos no orçamento mensal.</p></div>{spendingGoal > 0 ? <div className="mt-5"><div className="flex items-end justify-between"><div><p className="text-3xl font-bold">{Math.min(spendingProgress, 999).toFixed(0)}%</p><p className="text-xs text-muted-foreground">da meta utilizada</p></div><Target className={cn("h-8 w-8", spendingProgress > 100 ? "text-destructive" : "text-primary")} /></div><Progress value={Math.min(spendingProgress, 100)} className="mt-5 h-2.5" /><div className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Meta</span><strong>{formatCurrency(spendingGoal)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Gasto</span><strong>{formatCurrency(summary.expenses)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Disponível</span><strong>{formatCurrency(remainingBudget)}</strong></div></div></div> : <div className="mt-6 rounded-xl border border-dashed p-5 text-center"><Target className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Nenhuma meta definida</p><p className="mt-1 text-xs text-muted-foreground">Defina limites por categoria para comparar planejamento e realidade.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/financas/orcamento")}>Criar meta</Button></div>}</CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><h2 className="font-heading font-bold">Gastos por categoria</h2><p className="text-xs text-muted-foreground">Onde o dinheiro foi concentrado.</p>{categoryDistribution.length ? <><div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="75%" paddingAngle={2}>{categoryDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></div><div className="space-y-1.5">{categoryDistribution.slice(0, 5).map((item) => <div key={item.name} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span><strong>{formatCurrency(item.value)}</strong></div>)}</div></> : <p className="py-16 text-center text-sm text-muted-foreground">Sem despesas classificadas neste mês.</p>}</CardContent></Card>

        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><h2 className="font-heading font-bold">Gastos por cartão</h2><p className="text-xs text-muted-foreground">Faturas e lançamentos feitos no crédito.</p>{cardSpending.length ? <div className="mt-6 space-y-4">{cardSpending.map((item) => { const share = cardSpendingTotal > 0 ? item.value / cardSpendingTotal * 100 : 0; return <div key={item.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{item.name}</span><strong>{formatCurrency(item.value)}</strong></div><div className="mt-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: item.color }} /></div><span className="w-10 text-right text-[10px] font-semibold text-muted-foreground">{share.toFixed(0)}%</span></div></div>; })}</div> : <div className="py-14 text-center"><CreditCard className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Nenhum gasto associado a cartão neste mês.</p><p className="mt-1 text-xs text-muted-foreground">Ao adicionar uma fatura, selecione o cartão correspondente.</p></div>}</CardContent></Card>

        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><h2 className="font-heading font-bold">Fixos x variáveis</h2><p className="text-xs text-muted-foreground">Quanto da sua estrutura mensal pode ser ajustada.</p>{fixedVariable.length ? <><div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={fixedVariable} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="76%" paddingAngle={3}>{fixedVariable.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-2">{fixedVariable.map((item) => <div key={item.name} className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.name}</p><p className="mt-1 font-bold">{formatCurrency(item.value)}</p></div>)}</div></> : <p className="py-16 text-center text-sm text-muted-foreground">Registre gastos fixos e variáveis para comparar.</p>}</CardContent></Card>

        <Card className="border-border/70 shadow-card"><CardContent className="p-5"><h2 className="font-heading font-bold">Evolução do resultado</h2><p className="text-xs text-muted-foreground">A sobra ou déficit de cada fechamento.</p><div className="mt-4 h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={evolution} margin={{ left: -20, right: 4 }}><defs><linearGradient id="resultArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} /><YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={chartTooltipStyle} /><Area type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#resultArea)" /></AreaChart></ResponsiveContainer></div><div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs"><span className="text-muted-foreground">Taxa de economia em {monthTitle(referenceMonth)}: </span><strong className={summary.savingsRate >= 0 ? "text-success" : "text-destructive"}>{summary.savingsRate.toFixed(0)}%</strong></div></CardContent></Card>
      </section>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-card"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><BrainCircuit className="h-5 w-5" /></div><div><h2 className="font-heading font-bold">Leitura do seu mês</h2><p className="text-xs text-muted-foreground">Orientações geradas somente a partir dos seus números.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{insights.map((insight) => <div key={insight.id} className={cn("rounded-xl border p-3 text-sm leading-relaxed", insightStyle[insight.tone])}>{insight.text}</div>)}</div></CardContent></Card>

      <section className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-bold">Seus planos</h2><p className="text-xs text-muted-foreground">Progresso e previsão com base no ritmo de reserva.</p></div><Button variant="ghost" size="sm" onClick={() => navigate("/financas/cofrinhos")}>Ver todos <ArrowRight className="ml-1 h-4 w-4" /></Button></div>{goalProjections.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{goalProjections.slice(0, 3).map((goal) => <Card key={goal.id} className="border-border/70 shadow-card"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="truncate font-semibold">{goal.name}</p><span className="text-xs font-bold text-primary">{goal.progress.toFixed(0)}%</span></div><Progress value={goal.progress} className="mt-3 h-2" /><div className="mt-3 flex justify-between text-[11px] text-muted-foreground"><span>{formatCurrency(goal.saved)} guardados</span><span>Faltam {formatCurrency(goal.missing)}</span></div><p className="mt-2 text-[11px] text-muted-foreground">{goal.estimatedMonth ? `Previsão: ${monthTitle(goal.estimatedMonth)}` : goal.missing <= 0 ? "Objetivo alcançado" : "Adicione uma reserva mensal para calcular a previsão"}</p></CardContent></Card>)}</div>}
        <GoalsSection userId={userId} goals={goals} accounts={accounts} monthlySurplus={Math.max(summary.result, 0)} allocatedThisMonth={reservedForPlans} refMonth={referenceMonth} onReload={load} />
      </section>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} defaultDate={`${referenceMonth}-01`} onSaved={load} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </div>
  );
};

export default FinanceDashboard;
