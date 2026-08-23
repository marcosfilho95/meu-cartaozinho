import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  ListChecks,
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
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { SmartAddDialog } from "@/components/finance/SmartAddDialog";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { syncCartaozinhoIncomeMonths } from "@/lib/finance/cartaozinhoSync";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import {
  buildCategoryTrends,
  buildInsights,
  compareMonths,
  getAnalysisMonthKeys,
  monthTitle,
  projectGoal,
  summarizeMonth,
  summarizePeriod,
  type AnalysisPeriod,
  type Insight,
} from "@/lib/financeInsights";
import { calculateReserveMovement, getTransactionReferenceMonth, type GoalMovement } from "@/lib/financeOverview";
import { type PlanningGoal } from "@/lib/financePlanning";
import { addMonthsToKey, fetchAllFinanceTransactions, monthKey, resolveBankCategoryColor, type FinanceTx } from "@/lib/financeShared";
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

const chartTooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
};

const analysisPeriodLabels: Record<AnalysisPeriod, string> = {
  month: "Mensal",
  semester: "Semestral",
  year: "Anual",
  all: "Todo o período",
};

const insightToneStyles: Record<Insight["tone"], string> = {
  positive: "border-success/25 bg-success/5 text-success",
  neutral: "border-border/70 bg-card text-foreground",
  attention: "border-warning/35 bg-warning/5 text-foreground",
};

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [referenceMonth, setReferenceMonth] = useState(() => monthKey(new Date()));
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("semester");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
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

      const [goalsRes, goalTxRes, budgetsRes, loadedTransactions] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
        untypedSupabase.from("goal_transactions").select("amount, type, created_at").eq("user_id", userId).limit(1000),
        supabase.from("budgets").select("limit_amount").eq("user_id", userId).eq("ref_month", referenceMonth),
        fetchAllFinanceTransactions(userId),
      ]);
      if (goalsRes.error) throw goalsRes.error;
      if (goalTxRes.error) throw goalTxRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

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
  const comparison = useMemo(() => compareMonths(transactions, referenceMonth), [referenceMonth, transactions]);
  const categoryTrends = useMemo(() => buildCategoryTrends(transactions, referenceMonth), [referenceMonth, transactions]);
  const reserveMovement = useMemo(() => calculateReserveMovement(goalMovements, referenceMonth), [goalMovements, referenceMonth]);
  const reservedForPlans = Math.max(reserveMovement.net, 0);

  const analysisMonthKeys = useMemo(
    () => getAnalysisMonthKeys(transactions, referenceMonth, analysisPeriod),
    [analysisPeriod, referenceMonth, transactions],
  );
  const periodSummary = useMemo(
    () => summarizePeriod(transactions, analysisMonthKeys),
    [analysisMonthKeys, transactions],
  );
  const evolution = useMemo(() => analysisMonthKeys.map((key) => {
    const item = summarizeMonth(transactions, key);
    return { key, month: `${key.slice(5, 7)}/${key.slice(2, 4)}`, receitas: item.income, despesas: -item.expenses, resultado: item.result, economia: item.savingsRate };
  }), [analysisMonthKeys, transactions]);

  const expenseBreakdown = useMemo(() => {
    const grouped = new Map<string, { name: string; detail: string; value: number; color: string }>();
    transactions.forEach((transaction) => {
      if (
        transaction.type !== "expense" ||
        transaction.status === "canceled" ||
        !shouldIncludeInRealizedCalculations(transaction)
      ) return;
      if (getTransactionReferenceMonth(transaction) !== referenceMonth) return;
      const categoryName = transaction.categories?.name || "Sem categoria";
      const accountName = transaction.accounts?.name || "Sem conta";
      const name = String(transaction.source || transaction.notes || categoryName).trim() || "Sem descrição";
      const key = `${name.toLocaleLowerCase("pt-BR")}|${categoryName.toLocaleLowerCase("pt-BR")}`;
      const current = grouped.get(key) || {
        name,
        detail: `${categoryName} · ${accountName}`,
        value: 0,
        color: transaction.categories?.color || resolveBankCategoryColor(accountName, "#0F766E"),
      };
      current.value += Number(transaction.amount || 0);
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((first, second) => second.value - first.value);
  }, [referenceMonth, transactions]);
  const expenseBreakdownTotal = expenseBreakdown.reduce((total, expense) => total + expense.value, 0);

  const averageReserve = useMemo(() => {
    const months = analysisMonthKeys.slice(-3);
    if (months.length === 0) return 0;
    return months.reduce((sum, key) => sum + Math.max(calculateReserveMovement(goalMovements, key).net, 0), 0) / months.length;
  }, [analysisMonthKeys, goalMovements]);
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
          <Button onClick={() => navigate(`/financas/fechamento?mes=${referenceMonth}`)} className="gap-2"><BarChart3 className="h-4 w-4" /> Revisar mês</Button>
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
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-elevated"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><Badge variant="outline">{monthTitle(referenceMonth)}</Badge><h2 className="mt-3 font-heading text-xl font-bold">Este mês ainda está em branco</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Revise o mês para incluir renda, faturas, gastos fixos e valores destinados aos seus planos.</p></div><Button size="lg" onClick={() => navigate(`/financas/fechamento?mes=${referenceMonth}`)}>Começar revisão <ArrowRight className="ml-2 h-4 w-4" /></Button></CardContent></Card>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map(({ label, value, icon: Icon, tone, helper }) => <Card key={label} className="border-border/70 shadow-card"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", tone)} /></div><p className={cn("mt-3 text-2xl font-bold tabular-nums", tone)}>{formatCurrency(value)}</p><p className="mt-1 text-[11px] text-muted-foreground">{helper}</p></CardContent></Card>)}
        </section>
      )}

      {!loading && <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-card">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
            <div><h2 className="font-heading font-bold">Leitura de {monthTitle(referenceMonth)}</h2><p className="mt-0.5 text-xs text-muted-foreground">Insights atualizados automaticamente quando você troca o mês.</p></div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {insights.slice(0, 4).map((insight) => <div key={insight.id} className={cn("rounded-xl border p-3 text-sm leading-relaxed", insightToneStyles[insight.tone])}>{insight.text}</div>)}
          </div>
        </CardContent>
      </Card>}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold">Análise financeira</h2>
            <p className="text-xs text-muted-foreground">Escolha o período para comparar receitas, despesas e resultado.</p>
          </div>
          <Tabs value={analysisPeriod} onValueChange={(value) => setAnalysisPeriod(value as AnalysisPeriod)}>
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-xl sm:w-[430px]">
              {(Object.keys(analysisPeriodLabels) as AnalysisPeriod[]).map((period) => (
                <TabsTrigger key={period} value={period} className="px-2 text-[11px] sm:text-xs">
                  {analysisPeriodLabels[period]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="border-border/70 shadow-card">
            <CardContent className="flex h-full min-h-64 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="font-heading font-bold">Resumo {analysisPeriodLabels[analysisPeriod].toLowerCase()}</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Até {monthTitle(referenceMonth)} · {periodSummary.monthsWithData} {periodSummary.monthsWithData === 1 ? "mês" : "meses"} com dados</p></div>
                <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-success/5 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Receitas</p><p className="mt-1 font-bold tabular-nums text-success">{formatCurrency(periodSummary.income)}</p></div>
                <div className="rounded-xl bg-destructive/5 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Despesas</p><p className="mt-1 font-bold tabular-nums text-destructive">{formatCurrency(periodSummary.expenses)}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado</p><p className={cn("mt-1 font-bold tabular-nums", periodSummary.result >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(periodSummary.result)}</p></div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-4 text-xs">
                <span className="text-muted-foreground">Resultado médio por mês</span>
                <strong className={cn("tabular-nums", periodSummary.averageResult >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(periodSummary.averageResult)}</strong>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardContent className="h-full min-h-64 p-4">
              <div className="flex items-start justify-between gap-2"><div><h3 className="font-heading font-bold">Evolução financeira</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{analysisPeriodLabels[analysisPeriod]} · receitas, despesas e resultado</p></div><BarChart3 className="h-4 w-4 shrink-0 text-primary" /></div>
              <div className="mt-3 h-48 overflow-x-auto">
                <div className="h-full" style={{ minWidth: `${Math.max(440, evolution.length * 38)}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolution} stackOffset="sign" margin={{ top: 6, left: -28, right: 4, bottom: 24 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.75} />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={9} angle={-42} textAnchor="end" height={38} interval="preserveStartEnd" />
                    <YAxis axisLine={false} tickLine={false} fontSize={8} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value: number, name: string) => [formatCurrency(name === "Despesas" ? Math.abs(value) : value), name]} contentStyle={chartTooltipStyle} />
                    <Bar dataKey="receitas" name="Receitas" stackId="movimento" barSize={24} fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" stackId="movimento" barSize={24} fill="hsl(var(--destructive))" fillOpacity={0.78} radius={[0, 0, 4, 4]} />
                    <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardContent className="flex h-full min-h-64 flex-col p-4">
              <div className="flex items-start justify-between gap-2"><div><h3 className="font-heading font-bold">Planos e objetivos</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Veja o progresso sem misturar com seus gastos</p></div><PiggyBank className="h-4 w-4 shrink-0 text-primary" /></div>
              {goalProjections.length ? (
                <div className="mt-4 space-y-3">
                  {goalProjections.slice(0, 3).map((goal) => (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium">{goal.name}</span><strong className="text-primary">{goal.progress.toFixed(0)}%</strong></div>
                      <Progress value={goal.progress} className="mt-1.5 h-2" />
                      <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{formatCurrency(goal.saved)} guardados</span><span>Faltam {formatCurrency(goal.missing)}</span></div>
                    </div>
                  ))}
                </div>
              ) : <div className="my-auto rounded-xl border border-dashed p-5 text-center"><p className="text-sm font-medium">Nenhum plano criado</p><p className="mt-1 text-xs text-muted-foreground">Crie um objetivo, defina o valor e acompanhe o progresso.</p></div>}
              <Button className="mt-auto w-full" onClick={() => navigate("/financas/cofrinhos")}>{goalProjections.length ? "Organizar meus planos" : "Criar primeiro plano"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-card">
            <CardContent className="flex h-full min-h-64 flex-col p-4">
              <div className="flex items-start justify-between gap-2"><div><h3 className="font-heading font-bold">Detalhe dos gastos</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Todos os gastos de {monthTitle(referenceMonth)}</p></div><ListChecks className="h-4 w-4 shrink-0 text-primary" /></div>
              {expenseBreakdown.length ? <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">{expenseBreakdown.map((item) => { const share = expenseBreakdownTotal > 0 ? item.value / expenseBreakdownTotal * 100 : 0; return <div key={`${item.name}-${item.detail}`}><div className="flex items-start justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="truncate text-[10px] text-muted-foreground">{item.detail}</p></div><strong className="shrink-0 tabular-nums">{formatCurrency(item.value)}</strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: item.color }} /></div></div>; })}</div> : <div className="my-auto text-center"><ListChecks className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Nenhum gasto registrado neste mês.</p></div>}
              <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 pt-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total de despesas</p><p className="mt-0.5 font-bold tabular-nums">{formatCurrency(expenseBreakdownTotal)}</p></div><Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => navigate("/financas/transacoes")}>Abrir lançamentos <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} defaultDate={`${referenceMonth}-01`} onSaved={load} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </div>
  );
};

export default FinanceDashboard;
