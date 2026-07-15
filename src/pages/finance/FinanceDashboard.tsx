import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownCircle,
  ArrowUp,
  ArrowUpCircle,
  CalendarRange,
  CheckCircle2,
  Lightbulb,
  PiggyBank,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { GoalsSection } from "@/components/finance/GoalsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultGoals } from "@/lib/financeGoalDefaults";
import {
  buildCategoryMovements,
  getLastClosedMonthKey,
  getReductionOpportunities,
  getSavingsPlan,
  getTransactionsForMonth,
  type PlanningGoal,
} from "@/lib/financePlanning";
import {
  addMonthsToKey,
  fetchFinanceTransactions,
  getLastMonthKeys,
  getMonthLabel,
  type FinanceTx,
} from "@/lib/financeShared";
import { getExpensesByCategory, getMonthlyExpenses, getMonthlyIncome } from "@/lib/financeSelectors";
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
  include_in_net_worth: boolean;
};

type GoalTransaction = {
  id: string;
  amount: number;
  type: "deposit" | "withdraw";
  created_at: string;
  ref_month?: string | null;
};

const fullMonthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

const percentDelta = (current: number, previous: number) => {
  if (Math.abs(previous) < 0.01) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const ComparisonChip = ({
  current,
  previous,
  inverse = false,
  points = false,
}: {
  current: number;
  previous: number;
  inverse?: boolean;
  points?: boolean;
}) => {
  const delta = current - previous;
  const percentage = percentDelta(current, previous);
  const isPositive = inverse ? delta <= 0 : delta >= 0;
  const isStable = Math.abs(delta) < 0.01;

  return (
    <div className={cn(
      "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
      isStable ? "bg-muted text-muted-foreground" : isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
    )}>
      {isStable ? null : delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {isStable
        ? "Estável vs. mês anterior"
        : points
          ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} p.p. vs. mês anterior`
        : percentage === null
          ? `${delta > 0 ? "+" : ""}${formatCurrency(delta)}`
          : `${delta > 0 ? "+" : ""}${percentage.toFixed(1)}% vs. mês anterior`}
    </div>
  );
};

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [goals, setGoals] = useState<DashboardGoal[]>([]);
  const [goalTransactions, setGoalTransactions] = useState<GoalTransaction[]>([]);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [referenceMonth, setReferenceMonth] = useState(() => getLastClosedMonthKey());
  const [chartRange, setChartRange] = useState<6 | 12>(6);
  const [accountFilter, setAccountFilter] = useState("all");
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickDialogType, setQuickDialogType] = useState<"expense" | "income">("expense");

  const loadGoalTransactions = useCallback(async () => {
    const complete = await supabase
      .from("goal_transactions")
      .select("id, amount, type, created_at, ref_month")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!complete.error) return (complete.data || []) as GoalTransaction[];

    const legacy = await supabase
      .from("goal_transactions")
      .select("id, amount, type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    return (legacy.data || []) as GoalTransaction[];
  }, [userId]);

  const loadGoals = useCallback(async () => {
    const complete = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .order("priority")
      .order("created_at");
    if (!complete.error) return (complete.data || []) as DashboardGoal[];

    const legacy = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    if (legacy.error) throw legacy.error;
    return (legacy.data || []) as DashboardGoal[];
  }, [userId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([
      ensureDefaultAccounts(userId),
      ensureDefaultCategories(userId),
      ensureDefaultGoals(userId),
    ]);

    try {
      const [accountsRes, goalsResult, txResult, goalTxResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, current_balance, is_active, include_in_net_worth")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        loadGoals(),
        fetchFinanceTransactions(userId, 18),
        loadGoalTransactions(),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      setAccounts((accountsRes.data || []) as DashboardAccount[]);
      setGoals(goalsResult);
      setTransactions(txResult || []);
      setGoalTransactions(goalTxResult);
    } catch {
      toast.error("Não foi possível carregar o planejamento financeiro.");
    } finally {
      setLoading(false);
    }
  }, [loadGoalTransactions, loadGoals, userId]);

  useEffect(() => {
    if (userId) void loadData();
  }, [loadData, userId]);

  useEffect(() => {
    const onFinanceSync = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string }>;
      if (custom.detail?.userId && custom.detail.userId !== userId) return;
      void loadData();
    };
    window.addEventListener("finance-sync-updated", onFinanceSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onFinanceSync as EventListener);
  }, [loadData, userId]);

  const filteredTransactions = useMemo(
    () => accountFilter === "all"
      ? transactions
      : transactions.filter((transaction) => transaction.account_id === accountFilter),
    [accountFilter, transactions],
  );
  const comparisonMonth = addMonthsToKey(referenceMonth, -1);
  const referenceTransactions = useMemo(
    () => getTransactionsForMonth(filteredTransactions, referenceMonth),
    [filteredTransactions, referenceMonth],
  );
  const comparisonTransactions = useMemo(
    () => getTransactionsForMonth(filteredTransactions, comparisonMonth),
    [comparisonMonth, filteredTransactions],
  );

  const income = useMemo(() => getMonthlyIncome(referenceTransactions), [referenceTransactions]);
  const expenses = useMemo(() => getMonthlyExpenses(referenceTransactions), [referenceTransactions]);
  const previousIncome = useMemo(() => getMonthlyIncome(comparisonTransactions), [comparisonTransactions]);
  const previousExpenses = useMemo(() => getMonthlyExpenses(comparisonTransactions), [comparisonTransactions]);
  const plan = useMemo(
    () => getSavingsPlan({ income, expenses, goals, refMonth: referenceMonth }),
    [expenses, goals, income, referenceMonth],
  );
  const previousPlan = useMemo(
    () => getSavingsPlan({ income: previousIncome, expenses: previousExpenses, goals, refMonth: comparisonMonth }),
    [comparisonMonth, goals, previousExpenses, previousIncome],
  );

  const categoryDistribution = useMemo(
    () => getExpensesByCategory(referenceTransactions),
    [referenceTransactions],
  );
  const categoryMovements = useMemo(
    () => buildCategoryMovements(referenceTransactions, comparisonTransactions),
    [comparisonTransactions, referenceTransactions],
  );
  const biggestIncreases = useMemo(
    () => categoryMovements.filter((movement) => movement.delta > 0.01).sort((a, b) => b.delta - a.delta).slice(0, 4),
    [categoryMovements],
  );
  const biggestDecreases = useMemo(
    () => categoryMovements.filter((movement) => movement.delta < -0.01).sort((a, b) => a.delta - b.delta).slice(0, 4),
    [categoryMovements],
  );
  const opportunities = useMemo(
    () => getReductionOpportunities(categoryMovements, plan.gap),
    [categoryMovements, plan.gap],
  );

  const referenceGoalAllocation = useMemo(
    () => goalTransactions.reduce((sum, transaction) => {
      const txMonth = transaction.ref_month || transaction.created_at.slice(0, 7);
      if (txMonth !== referenceMonth) return sum;
      return sum + (transaction.type === "deposit" ? Number(transaction.amount) : -Number(transaction.amount));
    }, 0),
    [goalTransactions, referenceMonth],
  );

  const referenceDate = useMemo(() => {
    const [year, month] = referenceMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [referenceMonth]);
  const evolutionKeys = useMemo(
    () => getLastMonthKeys(chartRange, referenceDate),
    [chartRange, referenceDate],
  );
  const evolutionData = useMemo(() => evolutionKeys.map((key) => {
    const monthTransactions = getTransactionsForMonth(filteredTransactions, key);
    const monthIncome = getMonthlyIncome(monthTransactions);
    const monthExpenses = getMonthlyExpenses(monthTransactions);
    return {
      key,
      month: getMonthLabel(key),
      receitas: monthIncome,
      despesas: monthExpenses,
      sobra: monthIncome - monthExpenses,
    };
  }), [evolutionKeys, filteredTransactions]);

  const selectableMonths = useMemo(() => getLastMonthKeys(13, new Date()).slice(0, -1).reverse(), []);
  const hasReferenceData = referenceTransactions.some((transaction) => transaction.status !== "canceled");
  const planTone = !hasReferenceData
    ? { icon: CalendarRange, title: "Fechamento ainda não importado", className: "border-border bg-muted/30 text-muted-foreground" }
    : plan.status === "good"
    ? { icon: CheckCircle2, title: "Você está no ritmo dos seus sonhos", className: "border-success/30 bg-success/5 text-success" }
    : plan.status === "attention"
      ? { icon: AlertTriangle, title: "Sua poupança ficou perto da meta", className: "border-warning/30 bg-warning/5 text-warning" }
      : { icon: AlertTriangle, title: "Atenção à capacidade de poupança", className: "border-destructive/30 bg-destructive/5 text-destructive" };
  const PlanIcon = planTone.icon;

  const openQuickDialog = (type: "expense" | "income") => {
    setQuickDialogType(type);
    setQuickDialogOpen(true);
  };

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Planejamento financeiro</p>
            <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight">
              Fechamento de {fullMonthLabel(referenceMonth)}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">O painel abre no último mês encerrado e compara com {fullMonthLabel(comparisonMonth)}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openQuickDialog("expense")} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Novo lançamento
            </Button>
            <Button size="sm" onClick={() => navigate("/financas/importacoes")} className="gap-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" /> Importar fechamento
            </Button>
          </div>
        </header>

        <Card className="border-0 shadow-elevated">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="text-[11px] text-muted-foreground">Mês fechado</Label>
              <Select value={referenceMonth} onValueChange={setReferenceMonth}>
                <SelectTrigger className="mt-1 h-10"><CalendarRange className="mr-2 h-4 w-4 text-primary" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selectableMonths.map((key) => <SelectItem key={key} value={key}>{fullMonthLabel(key)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Conta</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="h-10 justify-center px-3 text-[11px]">
              {loading ? "Atualizando…" : `${referenceTransactions.length} lançamentos analisados`}
            </Badge>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-0 shadow-card"><CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sobra do fechamento</p>
            <p className={cn("mt-1 font-heading text-3xl font-extrabold", plan.surplus >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(plan.surplus)}</p>
            <p className="text-xs text-muted-foreground">Receitas menos despesas</p>
            <ComparisonChip current={plan.surplus} previous={previousPlan.surplus} />
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4">
            <ArrowUpCircle className="h-5 w-5 text-success" />
            <p className="mt-2 text-[11px] text-muted-foreground">Receitas</p>
            <p className="text-xl font-bold text-success">{formatCurrency(income)}</p>
            <ComparisonChip current={income} previous={previousIncome} />
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4">
            <ArrowDownCircle className="h-5 w-5 text-destructive" />
            <p className="mt-2 text-[11px] text-muted-foreground">Despesas</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(expenses)}</p>
            <ComparisonChip current={expenses} previous={previousExpenses} inverse />
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4">
            <PiggyBank className="h-5 w-5 text-primary" />
            <p className="mt-2 text-[11px] text-muted-foreground">Taxa de poupança</p>
            <p className={cn("text-xl font-bold", plan.savingsRate >= 20 ? "text-success" : "text-warning")}>{plan.savingsRate.toFixed(1)}%</p>
            <ComparisonChip current={plan.savingsRate} previous={previousPlan.savingsRate} points />
          </CardContent></Card>
        </section>

        <Card className={cn("border shadow-card", planTone.className)}>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-background/80 p-2"><PlanIcon className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">{planTone.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {!hasReferenceData
                      ? `Importe ou lance as movimentações de ${fullMonthLabel(referenceMonth)} para calcular sua capacidade de poupança.`
                      : plan.status === "good"
                      ? `A sobra de ${formatCurrency(plan.positiveSurplus)} cobre sua meta mensal de ${formatCurrency(plan.monthlyTarget)}.`
                      : `Você poderia direcionar ${formatCurrency(plan.positiveSurplus)} aos objetivos, mas sua meta mensal pede ${formatCurrency(plan.monthlyTarget)}. Faltaram ${formatCurrency(plan.gap)}.`}
                  </p>
                </div>
              </div>
              <Badge className="bg-background text-foreground shadow-sm">
                {hasReferenceData ? `${Math.min(plan.achievement, 999).toFixed(0)}% da meta mensal` : "Aguardando dados"}
              </Badge>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-background/80">
              <div className={cn("h-full rounded-full", !hasReferenceData ? "bg-muted-foreground/30" : plan.status === "good" ? "bg-success" : plan.status === "attention" ? "bg-warning" : "bg-destructive")} style={{ width: `${hasReferenceData ? Math.min(plan.achievement, 100) : 0}%` }} />
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Sobra possível</p><p className="font-bold text-foreground">{formatCurrency(plan.positiveSurplus)}</p></div>
              <div><p className="text-xs text-muted-foreground">Já enviado aos cofrinhos</p><p className="font-bold text-foreground">{formatCurrency(Math.max(referenceGoalAllocation, 0))}</p></div>
              <div><p className="text-xs text-muted-foreground">Meta calculada</p><p className="font-bold text-foreground">{formatCurrency(plan.monthlyTarget)}</p></div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-heading text-sm font-bold">Evolução dos meses fechados</h2><p className="text-xs text-muted-foreground">O mês atual não entra até ser encerrado.</p></div>
              <div className="flex gap-1 rounded-lg border border-border p-1">
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(6)}>6M</button>
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 12 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(12)}>12M</button>
              </div>
            </div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={evolutionData}>
              <defs>
                <linearGradient id="incomePlanning" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0.28} /><stop offset="95%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0} /></linearGradient>
                <linearGradient id="expensePlanning" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.24} /><stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Sobra"]} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Area type="monotone" dataKey="receitas" stroke="hsl(152, 55%, 48%)" fill="url(#incomePlanning)" strokeWidth={2} />
              <Area type="monotone" dataKey="despesas" stroke="hsl(0, 72%, 55%)" fill="url(#expensePlanning)" strokeWidth={2} />
              <Line type="monotone" dataKey="sobra" stroke="#1E40AF" strokeWidth={2.4} dot={{ r: 3 }} />
            </AreaChart></ResponsiveContainer></div>
          </CardContent></Card>

          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div><h2 className="font-heading text-sm font-bold">Para onde foi o dinheiro</h2><p className="text-xs text-muted-foreground">Participação nas despesas de {fullMonthLabel(referenceMonth)}.</p></div>
            {categoryDistribution.length === 0 ? <p className="text-sm text-muted-foreground">Sem despesas no mês selecionado.</p> : <>
              <div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="78%" paddingAngle={2}>{categoryDistribution.map((item) => <Cell key={item.key} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} /></PieChart></ResponsiveContainer></div>
              <div className="space-y-1.5">{categoryDistribution.slice(0, 5).map((item) => <div key={item.key} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span>{item.label}</span></div><span className="font-semibold">{item.percentage.toFixed(1)}%</span></div>)}</div>
            </>}
          </CardContent></Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-card"><CardContent className="space-y-4 p-4">
            <div><h2 className="font-heading text-sm font-bold">O que mais mudou</h2><p className="text-xs text-muted-foreground">Comparação direta com {fullMonthLabel(comparisonMonth)}.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-xs font-semibold text-destructive"><TrendingUp className="h-3.5 w-3.5" /> Maiores aumentos</p>
                {biggestIncreases.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum aumento relevante.</p> : biggestIncreases.map((movement) => <div key={movement.id} className="rounded-xl border border-border/70 p-2.5"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">{movement.label}</span><span className="font-bold text-destructive">+{formatCurrency(movement.delta)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min(movement.share, 100)}%` }} /></div></div>)}
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-xs font-semibold text-success"><TrendingDown className="h-3.5 w-3.5" /> Maiores reduções</p>
                {biggestDecreases.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma redução relevante.</p> : biggestDecreases.map((movement) => <div key={movement.id} className="rounded-xl border border-border/70 p-2.5"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">{movement.label}</span><span className="font-bold text-success">-{formatCurrency(Math.abs(movement.delta))}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Agora {formatCurrency(movement.current)}</p></div>)}
              </div>
            </div>
          </CardContent></Card>

          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2"><Lightbulb className="mt-0.5 h-4 w-4 text-warning" /><div><h2 className="font-heading text-sm font-bold">Onde existe espaço para ajustar</h2><p className="text-xs text-muted-foreground">Sugestões priorizam gastos flexíveis e aumentos recentes.</p></div></div>
            {opportunities.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há base suficiente para sugerir cortes responsáveis.</p> : opportunities.map((opportunity) => <div key={opportunity.id} className="rounded-xl border border-border/70 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{opportunity.label}</p><p className="text-xs text-muted-foreground">Gasto no mês: {formatCurrency(opportunity.current)}{opportunity.delta > 0 ? ` · subiu ${formatCurrency(opportunity.delta)}` : ""}</p></div><Badge variant="outline" className="shrink-0 text-success">até {formatCurrency(opportunity.potential)}</Badge></div></div>)}
            <p className="text-[10px] text-muted-foreground">As sugestões são indicativas. Saúde, moradia e outras despesas essenciais não são tratadas como cortes automáticos.</p>
          </CardContent></Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><div><h2 className="font-heading text-lg font-bold">Cofrinhos e sonhos</h2><p className="text-xs text-muted-foreground">Transforme a sobra do fechamento em progresso visível.</p></div></div>
          <GoalsSection
            userId={userId}
            goals={goals}
            accounts={accounts}
            monthlySurplus={plan.positiveSurplus}
            allocatedThisMonth={Math.max(referenceGoalAllocation, 0)}
            refMonth={referenceMonth}
            onReload={loadData}
          />
        </section>
      </div>

      <AddTransactionDialog
        key={quickDialogType}
        open={quickDialogOpen}
        onOpenChange={setQuickDialogOpen}
        userId={userId}
        defaultType={quickDialogType}
      />
    </>
  );
};

export default FinanceDashboard;
