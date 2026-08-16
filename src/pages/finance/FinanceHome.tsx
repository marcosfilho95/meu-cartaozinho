import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpCircle,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CreditCard,
  Loader2,
  CheckCircle2,
  PiggyBank,
  Repeat,
  Upload,
  Wallet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { DailyOrganizerPanel } from "@/components/finance/DailyOrganizerPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import {
  addMonthsToKey,
  fetchFinanceTransactions,
  getLastMonthKeys,
  monthKey,
  type FinanceTx,
} from "@/lib/financeShared";
import { buildExpenseBreakdown, buildMonthlyEvolution } from "@/lib/financeAnalytics";
import {
  calculateMonthlyResult,
  calculateNetWorth,
  calculateReserveMovement,
  type GoalMovement,
} from "@/lib/financeOverview";
import {
  fetchExpectedBillsForMonth,
  generateExpectedBillsForMonth,
  type FixedBillPreview,
} from "@/lib/finance/fixedBills";
import { cn } from "@/lib/utils";
import { buildCategoryMovements, getTransactionsForMonth } from "@/lib/financePlanning";

interface FinanceHomeProps {
  userId: string;
}

type FixedExpense = {
  id: string;
  name: string | null;
  amount: number | null;
  day_of_month: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  is_active: boolean;
  template_payload: { source?: string; amount?: number; type?: string } | null;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  current_balance: number | null;
  include_in_net_worth: boolean;
};

type GoalRow = { current_amount: number | null };

const fullMonthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const percentDelta = (current: number, previous: number) => {
  if (Math.abs(previous) < 0.01) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const ComparisonChip = ({ current, previous, inverse = false, points = false }: {
  current: number;
  previous: number;
  inverse?: boolean;
  points?: boolean;
}) => {
  const delta = current - previous;
  const percentage = percentDelta(current, previous);
  const stable = Math.abs(delta) < 0.01;
  const positive = inverse ? delta <= 0 : delta >= 0;
  return (
    <div className={cn(
      "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
      stable ? "bg-muted text-muted-foreground" : positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
    )}>
      {stable ? null : delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {stable
        ? "Estável vs. mês anterior"
        : points
          ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} p.p.`
          : percentage === null
            ? `${delta > 0 ? "+" : ""}${formatCurrency(delta)}`
            : `${delta > 0 ? "+" : ""}${percentage.toFixed(1)}% vs. mês anterior`}
    </div>
  );
};

const FinanceHome: React.FC<FinanceHomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [refMonth, setRefMonth] = useState(() => monthKey(new Date()));
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"expense" | "income">("expense");
  const [monthBills, setMonthBills] = useState<FixedBillPreview[]>([]);
  const [generating, setGenerating] = useState(false);
  const [chartRange, setChartRange] = useState<6 | 12>(6);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
    try {
      const [txs, accountsRes, goalsRes, goalMovementsRes, recurrencesRes] = await Promise.all([
        fetchFinanceTransactions(userId, 12),
        supabase
          .from("accounts")
          .select("id, name, type, current_balance, include_in_net_worth")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase.from("goals").select("current_amount").eq("user_id", userId),
        untypedSupabase
          .from("goal_transactions")
          .select("amount, type, ref_month, created_at")
          .eq("user_id", userId)
          .limit(1000),
        untypedSupabase
          .from("recurrences")
          .select("id, name, amount, day_of_month, frequency, is_active, template_payload")
          .eq("user_id", userId)
          .eq("is_active", true),
      ]);
      setTransactions(txs || []);
      setAccounts((accountsRes.data || []) as AccountRow[]);
      setGoals((goalsRes.data || []) as GoalRow[]);
      setGoalMovements((goalMovementsRes.data || []) as GoalMovement[]);
      setFixedExpenses(((recurrencesRes.data || []) as FixedExpense[]) || []);
    } catch {
      toast.error("Não foi possível carregar o painel financeiro.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const syncFixedBills = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return;
      setGenerating(true);
      try {
        const result = await generateExpectedBillsForMonth(userId, refMonth);
        const bills = await fetchExpectedBillsForMonth(userId, refMonth);
        setMonthBills(bills);
        if (!options?.silent) {
          toast.success(
            result.created > 0
              ? `${result.created} conta(s) fixa(s) gerada(s) para o mês.`
              : "Todas as contas fixas do mês já estão geradas.",
          );
        }
      } catch {
        if (!options?.silent) toast.error("Não foi possível gerar as contas fixas do mês.");
      } finally {
        setGenerating(false);
      }
    },
    [refMonth, userId],
  );

  useEffect(() => {
    if (userId) void load();
  }, [load, userId]);

  useEffect(() => {
    if (userId) void syncFixedBills({ silent: true });
  }, [syncFixedBills, userId]);

  useEffect(() => {
    const onSync = () => void load();
    window.addEventListener("finance-sync-updated", onSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onSync as EventListener);
  }, [load]);

  const monthSummary = useMemo(
    () => calculateMonthlyResult(transactions, refMonth),
    [refMonth, transactions],
  );
  const reserveMovement = useMemo(
    () => calculateReserveMovement(goalMovements, refMonth),
    [goalMovements, refMonth],
  );
  const netWorth = useMemo(() => calculateNetWorth(accounts, goals), [accounts, goals]);
  const income = monthSummary.income;
  const expenses = monthSummary.expenses;
  const pendingExpenses = monthSummary.pendingExpenses;
  const balance = monthSummary.result;
  const previousMonth = addMonthsToKey(refMonth, -1);
  const previousSummary = useMemo(
    () => calculateMonthlyResult(transactions, previousMonth),
    [previousMonth, transactions],
  );
  const savingsRate = income > 0 ? (balance / income) * 100 : 0;
  const previousSavingsRate = previousSummary.income > 0
    ? (previousSummary.result / previousSummary.income) * 100
    : 0;
  const referenceTransactions = useMemo(
    () => getTransactionsForMonth(transactions, refMonth),
    [refMonth, transactions],
  );
  const previousTransactions = useMemo(
    () => getTransactionsForMonth(transactions, previousMonth),
    [previousMonth, transactions],
  );
  const categoryMovements = useMemo(
    () => buildCategoryMovements(referenceTransactions, previousTransactions),
    [previousTransactions, referenceTransactions],
  );
  const biggestIncreases = useMemo(
    () => categoryMovements.filter((item) => item.delta > 0.01).sort((a, b) => b.delta - a.delta).slice(0, 3),
    [categoryMovements],
  );
  const biggestDecreases = useMemo(
    () => categoryMovements.filter((item) => item.delta < -0.01).sort((a, b) => a.delta - b.delta).slice(0, 3),
    [categoryMovements],
  );

  const evolutionMonths = useMemo(
    () => getLastMonthKeys(chartRange, new Date(`${refMonth}-15T12:00:00`)),
    [chartRange, refMonth],
  );
  const evolutionData = useMemo(
    () => buildMonthlyEvolution(transactions, evolutionMonths, goalMovements),
    [evolutionMonths, goalMovements, transactions],
  );
  const hasEvolutionData = useMemo(
    () => evolutionData.some((point) => point.receitas !== 0 || point.despesas !== 0),
    [evolutionData],
  );
  const cardBreakdown = useMemo(() => {
    const allCards = buildExpenseBreakdown(transactions, "card", { months: [refMonth], limit: 100 });
    if (allCards.length <= 5) return allCards;

    const visible = allCards.slice(0, 4);
    const otherValue = allCards.slice(4).reduce((sum, item) => sum + item.value, 0);
    const total = allCards.reduce((sum, item) => sum + item.value, 0);
    return [
      ...visible,
      {
        key: "outros-cartoes",
        name: "Outros cartões",
        value: otherValue,
        color: "#94A3B8",
        percentage: total > 0 ? (otherValue / total) * 100 : 0,
      },
    ];
  }, [refMonth, transactions]);
  const cardTotal = useMemo(
    () => cardBreakdown.reduce((sum, item) => sum + item.value, 0),
    [cardBreakdown],
  );

  const fixedMonthlyTotal = useMemo(
    () =>
      fixedExpenses
        .filter((item) => item.frequency === "monthly")
        .reduce((sum, item) => sum + Number(item.amount ?? item.template_payload?.amount ?? 0), 0),
    [fixedExpenses],
  );

  const fixedOpen = useMemo(
    () => monthBills.filter((bill) => !["paid", "ignored", "canceled"].includes(bill.status)),
    [monthBills],
  );
  const fixedOpenTotal = useMemo(() => fixedOpen.reduce((sum, bill) => sum + bill.amount, 0), [fixedOpen]);

  const markBillPaid = async (bill: FixedBillPreview) => {
    setTogglingId(bill.id);
    const { error } = await supabase.from("expected_bills").update({ status: "paid" }).eq("id", bill.id);
    setTogglingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMonthBills((current) => current.map((item) => (item.id === bill.id ? { ...item, status: "paid" } : item)));
    toast.success("Conta fixa marcada como paga.");
  };

  const selectableMonths = useMemo(() => {
    const current = monthKey(new Date());
    return [addMonthsToKey(current, 1), current, ...[1, 2, 3, 4, 5].map((i) => addMonthsToKey(current, -i))];
  }, []);

  const handleTogglePaid = async (tx: FinanceTx) => {
    setTogglingId(tx.id);
    const { error } = await supabase.from("transactions").update({ status: "paid" }).eq("id", tx.id);
    setTogglingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lançamento marcado como pago.");
    setTransactions((current) => current.map((item) => (item.id === tx.id ? { ...item, status: "paid" } : item)));
  };

  const openDialog = (type: "expense" | "income") => {
    setDialogType(type);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Organizador</p>
            <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight capitalize">
              {fullMonthLabel(refMonth)}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Resumo do mês, comparação com o anterior e evolução da sua vida financeira.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={refMonth} onValueChange={setRefMonth}>
              <SelectTrigger className="h-9 w-[190px] text-xs">
                <CalendarRange className="mr-2 h-3.5 w-3.5 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectableMonths.map((key) => (
                  <SelectItem key={key} value={key} className="capitalize">
                    {fullMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => navigate("/financas/importacoes")}>
              <Upload className="h-3.5 w-3.5" /> Importar
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => navigate("/financas/fechamento")}>
              <PiggyBank className="h-3.5 w-3.5" /> Fechamento completo
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <PiggyBank className="h-5 w-5 text-primary" />
              <p className="mt-2 text-[11px] text-muted-foreground">Resultado do mês</p>
              <p className={cn("text-xl font-bold", balance >= 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(balance)}
              </p>
              <ComparisonChip current={balance} previous={previousSummary.result} />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <ArrowUpCircle className="h-5 w-5 text-success" />
              <p className="mt-2 text-[11px] text-muted-foreground">Receitas do mês</p>
              <p className="text-xl font-bold text-success">{formatCurrency(income)}</p>
              <ComparisonChip current={income} previous={previousSummary.income} />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
              <p className="mt-2 text-[11px] text-muted-foreground">Despesas do mês</p>
              <p className="text-xl font-bold text-destructive">{formatCurrency(expenses)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatCurrency(pendingExpenses)} ainda a pagar</p>
              <ComparisonChip current={expenses} previous={previousSummary.expenses} inverse />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <PiggyBank className="h-5 w-5 text-primary" />
              <p className="mt-2 text-[11px] text-muted-foreground">Taxa de poupança</p>
              <p className={cn("text-xl font-bold", savingsRate >= 20 ? "text-success" : savingsRate >= 0 ? "text-warning" : "text-destructive")}>
                {savingsRate.toFixed(1)}%
              </p>
              <ComparisonChip current={savingsRate} previous={previousSavingsRate} points />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <Wallet className="h-5 w-5 text-primary" />
              <p className="mt-2 text-[11px] text-muted-foreground">Patrimônio total</p>
              <p className={cn("text-xl font-bold", netWorth.total >= 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(netWorth.total)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatCurrency(netWorth.goals)} em cofrinhos
                {netWorth.debts > 0 ? ` · ${formatCurrency(netWorth.debts)} em dívidas` : ""}
              </p>
            </CardContent>
          </Card>
        </section>

        <Card className={cn(
          "border shadow-card",
          balance < 0
            ? "border-destructive/30 bg-destructive/5"
            : savingsRate >= 20
              ? "border-success/30 bg-success/5"
              : "border-warning/30 bg-warning/5",
        )}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-background/80 p-2">
                {balance < 0
                  ? <AlertTriangle className="h-5 w-5 text-destructive" />
                  : <CheckCircle2 className={cn("h-5 w-5", savingsRate >= 20 ? "text-success" : "text-warning")} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-base font-bold">
                  {balance < 0
                    ? "Você gastou mais do que recebeu neste mês"
                    : savingsRate >= 20
                      ? "Você está poupando em um bom ritmo"
                      : "O mês está positivo, mas ainda há espaço para poupar mais"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {balance < 0 && reserveMovement.withdrawals > 0
                    ? `O resultado ficou negativo em ${formatCurrency(Math.abs(balance))} e houve retirada de ${formatCurrency(reserveMovement.withdrawals)} dos cofrinhos.`
                    : balance < 0
                      ? `Faltaram ${formatCurrency(Math.abs(balance))} para o mês fechar no positivo.`
                      : reserveMovement.deposits > 0
                        ? `Sobrou ${formatCurrency(balance)} e você já direcionou ${formatCurrency(reserveMovement.deposits)} aos cofrinhos.`
                        : `Sobrou ${formatCurrency(balance)}. Uma referência simples é guardar pelo menos 20% da renda.`}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 bg-background/70">Meta 20%</Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background/80">
              <div
                className={cn("h-full rounded-full", savingsRate >= 20 ? "bg-success" : savingsRate >= 0 ? "bg-warning" : "bg-destructive")}
                style={{ width: `${Math.max(0, Math.min(100, (savingsRate / 20) * 100))}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <DailyOrganizerPanel
          userId={userId}
          transactions={transactions}
          togglingId={togglingId}
          onToggleTransaction={handleTogglePaid}
          onNewExpense={() => openDialog("expense")}
          onNewIncome={() => openDialog("income")}
          onViewTransactions={() => navigate("/financas/transacoes")}
        />

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div>
                    <h2 className="font-heading text-base font-bold">Evolução financeira</h2>
                    <p className="text-[11px] text-muted-foreground">Receitas, despesas e resultado · últimos {chartRange} meses</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex gap-1 rounded-lg border border-border p-1">
                    <button type="button" className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", chartRange === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(6)}>6M</button>
                    <button type="button" className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", chartRange === 12 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(12)}>12M</button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/relatorios")}>
                    Relatório
                  </Button>
                </div>
              </div>
              <div className="mt-4 h-72">
                {hasEvolutionData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={evolutionData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.45} />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatCurrency(Number(value)), name]}
                        contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" fillOpacity={0.82} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" fillOpacity={0.72} radius={[3, 3, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="saldo"
                        name="Resultado"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "hsl(var(--background))", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 text-center">
                    <BarChart3 className="mb-2 h-7 w-7 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Ainda não há histórico para comparar</p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">Registre ou importe receitas e despesas para acompanhar sua evolução.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <div>
                    <h2 className="font-heading text-base font-bold">Gastos por cartão</h2>
                    <p className="text-[11px] capitalize text-muted-foreground">{fullMonthLabel(refMonth)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/relatorios")}>
                  Detalhes
                </Button>
              </div>
              {cardTotal > 0 ? (
                <>
                  <div className="relative mt-2 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cardBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="58%"
                          outerRadius="82%"
                          paddingAngle={2}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        >
                          {cardBreakdown.map((item) => <Cell key={item.key} fill={item.color} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(Number(value))}
                          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                      <span className="font-heading text-lg font-bold tabular-nums">{formatCurrency(cardTotal)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {cardBreakdown.map((item) => (
                      <div key={item.key} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <span className="text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                        <span className="font-semibold tabular-nums">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 text-center">
                  <CreditCard className="mb-2 h-7 w-7 text-muted-foreground/50" />
                  <p className="text-sm font-medium">Nenhum gasto em cartão neste mês</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">Cadastre um cartão ou importe uma fatura para ver a comparação.</p>
                  <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={() => navigate("/financas/importacoes")}>
                    Importar fatura
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="border-0 shadow-card">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-base font-bold">O que mudou nos seus gastos</h2>
                <p className="text-xs text-muted-foreground">Comparação com {fullMonthLabel(previousMonth)}.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/fechamento")}>
                Análise completa
              </Button>
            </div>
            {biggestIncreases.length === 0 && biggestDecreases.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                Ainda não há dois meses com despesas suficientes para comparar.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
                    <TrendingUp className="h-3.5 w-3.5" /> Onde você gastou mais
                  </p>
                  {biggestIncreases.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum aumento relevante.</p> : biggestIncreases.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{item.label}</span>
                      <span className="shrink-0 font-bold text-destructive">+{formatCurrency(item.delta)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-success">
                    <TrendingDown className="h-3.5 w-3.5" /> Onde você gastou menos
                  </p>
                  {biggestDecreases.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma redução relevante.</p> : biggestDecreases.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{item.label}</span>
                      <span className="shrink-0 font-bold text-success">-{formatCurrency(Math.abs(item.delta))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                <h2 className="font-heading text-base font-bold">Despesas fixas</h2>
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/recorrencias")}>
                Gerenciar
              </Button>
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Compromisso mensal</p>
                <p className="font-heading text-2xl font-extrabold">{formatCurrency(fixedMonthlyTotal)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fixedOpen.length} em aberto neste mês · {formatCurrency(fixedOpenTotal)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 text-xs"
                  disabled={generating}
                  onClick={() => void syncFixedBills()}
                >
                  {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Gerar contas do mês
                </Button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {monthBills.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                    Cadastre suas contas fixas (aluguel, luz, assinaturas) para prever o mês.
                  </p>
                ) : (
                  monthBills.slice(0, 5).map((bill) => {
                    const paid = bill.status === "paid";
                    return (
                      <div key={bill.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-semibold", paid && "text-muted-foreground line-through")}>
                            {bill.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Vence {new Date(`${bill.dueDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[11px]">{formatCurrency(bill.amount)}</Badge>
                        {!paid && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 shrink-0 px-2 text-[11px]"
                            disabled={togglingId === bill.id}
                            onClick={() => markBillPaid(bill)}
                          >
                            Pagar
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 rounded-2xl p-4 text-left"
            onClick={() => navigate("/financas/cofrinhos")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">🐷</span>
            <span>
              <span className="block text-sm font-semibold">Cofrinhos e sonhos</span>
              <span className="block text-xs font-normal text-muted-foreground">Casa, poupança, viagem, filhos</span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 rounded-2xl p-4 text-left"
            onClick={() => navigate("/financas/relatorios")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">📊</span>
            <span>
              <span className="block text-sm font-semibold">Relatórios e gráficos</span>
              <span className="block text-xs font-normal text-muted-foreground">Gastos por cartão, categoria e evolução</span>
            </span>
          </Button>
        </section>
      </div>

      <AddTransactionDialog
        key={dialogOpen ? `${dialogType}-open` : "closed"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        defaultType={dialogType}
      />
    </>
  );
};

export default FinanceHome;
