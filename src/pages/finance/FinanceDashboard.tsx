
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultGoals } from "@/lib/financeGoalDefaults";
import {
  CATEGORY_COLORS,
  FinanceTx,
  PAYMENT_LABELS,
  applyFinanceDimensionFilters,
  fetchFinanceTransactions,
  getCycleScopedTransactions,
  getLastMonthKeys,
  getMonthLabel,
  getPaymentKey,
  isBankCategory,
  isGenericCardCategory,
  monthKey,
  resolveBankCategoryColor,
  getPreviousCycleScopedTransactions,
} from "@/lib/financeShared";
import {
  getDashboardSummary,
  getExpenseHistory,
  getExpensesByCategory,
  getMonthlyExpenses,
  getMonthlyIncome,
  trendFromDelta,
} from "@/lib/financeSelectors";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Check, Clock, LineChart as LineChartIcon, Loader2 as Loader2Icon, PieChart as PieChartIcon, TrendingDown, TrendingUp } from "lucide-react";
import { GoalsSection } from "@/components/finance/GoalsSection";
import {
  Area,
  AreaChart,
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

interface FinanceDashboardProps { userId: string; }

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"simple" | "advanced">("simple");
  const [showGoalsOnSimple, setShowGoalsOnSimple] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);

  const [periodMonths, setPeriodMonths] = useState<1 | 3 | 6 | 12>(6);
  const [chartRange, setChartRange] = useState<6 | 12>(6);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const currentMonth = monthKey(new Date());
  const previousMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const todayDay = new Date().getDate();

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      await ensureDefaultAccounts(userId);
    } catch {
      // Non-blocking: dashboard still loads even if bootstrap fails.
    }
    try {
      await ensureDefaultCategories(userId);
    } catch {}
    try {
      await ensureDefaultGoals(userId);
    } catch {}

    try {
      const [accountsRes, categoriesRes, goalsRes, txResult] = await Promise.all([
        supabase.from("accounts").select("id, name, type, due_day, current_balance, is_active, include_in_net_worth").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("categories").select("id, name, color, kind, parent_id").eq("user_id", userId).order("name"),
        supabase.from("goals").select("id, name, target_amount, current_amount, is_completed").eq("user_id", userId).order("created_at"),
        fetchFinanceTransactions(userId, 12),
      ]);

      if (accountsRes.error || categoriesRes.error || goalsRes.error) {
        toast.error("Falha ao carregar dashboard financeiro.");
        setLoading(false);
        return;
      }

      setAccounts(accountsRes.data || []);
      setCategories(categoriesRes.data || []);
      setGoals(goalsRes.data || []);
      setTransactions(txResult || []);
    } catch (error) {
      toast.error("Falha ao carregar dashboard financeiro.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, loadData]);

  useEffect(() => {
    const onFinanceSync = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string }>;
      if (custom.detail?.userId && custom.detail.userId !== userId) return;
      loadData();
    };
    window.addEventListener("finance-sync-updated", onFinanceSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onFinanceSync as EventListener);
  }, [loadData, userId]);

  const hasBankExpenseCategories = useMemo(
    () => categories.some((category: any) => category.kind === "expense" && isBankCategory(String(category.name || ""))),
    [categories],
  );

  const parentCategories = useMemo(
    () => categories.filter((category: any) => category.kind === "expense" && !category.parent_id),
    [categories],
  );
  const subcategories = useMemo(
    () =>
      categoryFilter === "all"
        ? []
        : categories.filter((category: any) => {
            if (category.parent_id !== categoryFilter) return false;
            if (!hasBankExpenseCategories) return true;
            return !isGenericCardCategory(String(category.name || ""));
          }),
    [categories, categoryFilter, hasBankExpenseCategories],
  );

  useEffect(() => {
    if (categoryFilter === "all") { setSubcategoryFilter("all"); return; }
    if (subcategoryFilter === "all") return;
    if (!subcategories.some((item: any) => item.id === subcategoryFilter)) setSubcategoryFilter("all");
  }, [categoryFilter, subcategories, subcategoryFilter]);

  const dimensionalFilteredTx = useMemo(
    () =>
      applyFinanceDimensionFilters(transactions, {
        accountFilter,
        paymentFilter,
        statusFilter,
        categoryFilter,
        subcategoryFilter,
        categories,
      }),
    [transactions, accountFilter, paymentFilter, statusFilter, categoryFilter, subcategoryFilter, categories],
  );

  const baseTxForSummary = useMemo(
    () => (accountFilter === "all" ? transactions : transactions.filter((tx) => tx.account_id === accountFilter)),
    [transactions, accountFilter],
  );
  const txForCharts = useMemo(
    () => (viewMode === "simple" ? baseTxForSummary : dimensionalFilteredTx),
    [viewMode, baseTxForSummary, dimensionalFilteredTx],
  );

  const periodKeys = useMemo(() => getLastMonthKeys(periodMonths), [periodMonths]);
  const periodFilteredTx = useMemo(() => {
    const keySet = new Set(periodKeys);
    return txForCharts.filter((tx) => keySet.has(tx.transaction_date.slice(0, 7)));
  }, [txForCharts, periodKeys]);

  const currentMonthTx = useMemo(
    () => getCycleScopedTransactions(baseTxForSummary, currentMonth, todayDay),
    [baseTxForSummary, currentMonth, todayDay],
  );

  const previousMonthTx = useMemo(
    () => getPreviousCycleScopedTransactions(baseTxForSummary, currentMonth, previousMonth, todayDay),
    [baseTxForSummary, previousMonth, currentMonth, todayDay],
  );

  const currentIncome = useMemo(() => getMonthlyIncome(currentMonthTx), [currentMonthTx]);
  const currentExpense = useMemo(() => getMonthlyExpenses(currentMonthTx), [currentMonthTx]);
  const currentSummary = useMemo(() => getDashboardSummary(currentMonthTx), [currentMonthTx]);
  const paidExpense = currentSummary.paidExpense;
  const pendingExpense = currentSummary.pendingExpense;
  const previousIncome = useMemo(() => getMonthlyIncome(previousMonthTx), [previousMonthTx]);
  const previousExpense = useMemo(() => getMonthlyExpenses(previousMonthTx), [previousMonthTx]);

  const monthBalance = currentIncome - currentExpense;
  const previousBalance = previousIncome - previousExpense;
  const balanceDelta = monthBalance - previousBalance;
  const trendLabel = (current: number, previous: number) => {
    const delta = current - previous;
    const trend = trendFromDelta(delta);
    if (trend === "stable") return "Estável";
    return `${trend === "up" ? "Subiu" : "Caiu"} ${formatCurrency(Math.abs(delta))}`;
  };

  const evolutionBaseDate = useMemo(() => {
    const maxCycleExpenseMonth = currentMonthTx
      .filter((tx) => tx.type === "expense")
      .reduce((max, tx) => {
        const key = tx.transaction_date.slice(0, 7);
        return key > max ? key : max;
      }, currentMonth);

    if (maxCycleExpenseMonth <= currentMonth) return new Date();
    const [y, m] = maxCycleExpenseMonth.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }, [currentMonthTx, currentMonth]);

  const evolutionKeys = useMemo(() => getLastMonthKeys(chartRange, evolutionBaseDate), [chartRange, evolutionBaseDate]);
  const evolutionData = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    evolutionKeys.forEach((key) => { map[key] = { income: 0, expense: 0 }; });
    txForCharts.forEach((tx) => {
      const key = tx.transaction_date.slice(0, 7);
      if (!map[key] || tx.status === "canceled") return;
      if (tx.type === "income") map[key].income += Number(tx.amount);
      if (tx.type === "expense") map[key].expense += Number(tx.amount);
    });
    return evolutionKeys.map((key) => ({ key, month: getMonthLabel(key), receitas: map[key].income, despesas: map[key].expense, saldo: map[key].income - map[key].expense }));
  }, [txForCharts, evolutionKeys]);
  const expenseTxCurrent = useMemo(() => currentMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled"), [currentMonthTx]);
  const expenseTxCurrentForVisual = useMemo(() => expenseTxCurrent, [expenseTxCurrent]);

  const categoryDistribution = useMemo(() => getExpensesByCategory(expenseTxCurrentForVisual), [expenseTxCurrentForVisual]);

  const categoryRows = useMemo(() => {
    const currentMap: Record<string, number> = {};
    const previousMap: Record<string, number> = {};

    currentMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").forEach((tx) => {
      const id = tx.category_id || "uncategorized";
      currentMap[id] = (currentMap[id] || 0) + Number(tx.amount);
    });
    previousMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").forEach((tx) => {
      const id = tx.category_id || "uncategorized";
      previousMap[id] = (previousMap[id] || 0) + Number(tx.amount);
    });

    const currentTotal = Object.values(currentMap).reduce((sum, value) => sum + value, 0);
    return Object.entries(currentMap).map(([id, currentValue], index) => {
      const category = categories.find((item: any) => item.id === id);
      const previousValue = previousMap[id] || 0;
      const delta = currentValue - previousValue;
      const label = category?.name || "Sem categoria";
      const baseColor = category?.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      return {
        id,
        label,
        color: resolveBankCategoryColor(label, baseColor),
        currentValue,
        percentage: currentTotal > 0 ? (currentValue / currentTotal) * 100 : 0,
        delta,
        trend: trendFromDelta(delta),
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [currentMonthTx, previousMonthTx, categories]);

  const totalNetWorth = useMemo(() => accounts.reduce((sum, account) => sum + (account.include_in_net_worth ? Number(account.current_balance) : 0), 0), [accounts]);
  const paymentOptions = useMemo(() => Array.from(new Set(transactions.map((tx) => getPaymentKey(tx)))), [transactions]);

  const expenseHistory = useMemo(() => getExpenseHistory(txForCharts, evolutionKeys), [txForCharts, evolutionKeys]);
  const topExpenseCategories = expenseHistory.categories;
  const stackedExpenseData = expenseHistory.stacked;

  // Pending + recent transactions for dashboard
  const pendingTx = useMemo(() => currentMonthTx.filter((tx) => tx.status === "pending" || tx.status === "overdue").sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)), [currentMonthTx]);
  const recentTx = useMemo(() => [...currentMonthTx].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, 8), [currentMonthTx]);

  const handleToggleStatus = async (tx: FinanceTx) => {
    const newStatus = tx.status === "paid" ? "pending" : "paid";
    setTogglingId(tx.id);
    try {
      const { error } = await supabase.from("transactions").update({ status: newStatus }).eq("id", tx.id);
      if (error) throw error;
      toast.success(newStatus === "paid" ? "✅ Marcado como pago!" : "Voltou para pendente");
      await loadData();
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha"));
    } finally {
      setTogglingId(null);
    }
  };

  const isSimple = viewMode === "simple";

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <Card className="border-0 shadow-elevated">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">Modo</Badge>
                <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("simple")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition", isSimple ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Simples
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("advanced")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition", !isSimple ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Completo
                  </button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{isSimple ? "Visão direta para uso rápido" : "Visão detalhada com análise completa"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">Filtros</Badge>
              <span className="text-xs text-muted-foreground">{periodFilteredTx.length} transações no período</span>
              <span className="text-xs text-muted-foreground">
                Ciclo de fatura por cartão: <span className="font-semibold text-foreground">dinâmico</span>
              </span>
              {loading && <span className="text-xs text-muted-foreground">Atualizando...</span>}
            </div>
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", isSimple ? "xl:grid-cols-3" : "xl:grid-cols-6")}>
              <div>
                <Label className="text-[11px] text-muted-foreground">Período</Label>
                <Select value={String(periodMonths)} onValueChange={(value) => setPeriodMonths(Number(value) as 1 | 3 | 6 | 12)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 mês</SelectItem><SelectItem value="3">3 meses</SelectItem><SelectItem value="6">6 meses</SelectItem><SelectItem value="12">12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Conta</Label>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas</SelectItem>{accounts.map((account) => (<SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              {!isSimple && (
                <>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Categoria</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{parentCategories.map((category: any) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Subcategoria</Label>
                    <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{subcategories.map((category: any) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Forma de pagamento</Label>
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{paymentOptions.map((option) => (<SelectItem key={option} value={option}>{PAYMENT_LABELS[option] || option}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="overdue">Atrasado</SelectItem></SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-0 shadow-card xl:col-span-2"><CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Saldo do mês</p>
            <p className={cn("mt-1 font-heading text-3xl font-extrabold", monthBalance >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(monthBalance)}</p>
            <p className="text-xs text-muted-foreground">Receitas - despesas</p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1 text-xs">
              {balanceDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              <span className="font-semibold">Vs mês anterior: {trendLabel(monthBalance, previousBalance)}</span>
            </div>
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4 text-center"><ArrowUpCircle className="mx-auto h-4.5 w-4.5 text-success" /><p className="mt-1 text-[11px] text-muted-foreground">Receitas</p><p className="text-lg font-bold text-success">{formatCurrency(currentIncome)}</p></CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4 text-center"><ArrowDownCircle className="mx-auto h-4.5 w-4.5 text-destructive" /><p className="mt-1 text-[11px] text-muted-foreground">Despesas</p><p className="text-lg font-bold text-destructive">{formatCurrency(currentExpense)}</p></CardContent></Card>
          <Card className="border-0 shadow-card border-l-2 border-l-success"><CardContent className="p-4 text-center"><p className="text-[11px] text-muted-foreground">Pago</p><p className="text-lg font-bold text-success">{formatCurrency(paidExpense)}</p></CardContent></Card>
          <Card className="border-0 shadow-card border-l-2 border-l-warning"><CardContent className="p-4 text-center"><p className="text-[11px] text-muted-foreground">Pendente</p><p className="text-lg font-bold text-warning">{formatCurrency(pendingExpense)}</p></CardContent></Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold">Evolução de receitas e despesas</h2>
              <div className="flex gap-1 rounded-lg border border-border p-1">
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(6)}>6M</button>
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 12 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(12)}>12M</button>
              </div>
            </div>
            <div className="h-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={evolutionData}>
              <defs>
                <linearGradient id="incomeGradDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0} /></linearGradient>
                <linearGradient id="expenseGradDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.28} /><stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Saldo"]}
                contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
              />
              <Area type="monotone" dataKey="receitas" stroke="hsl(152, 55%, 48%)" fill="url(#incomeGradDashboard)" strokeWidth={2} />
              <Area type="monotone" dataKey="despesas" stroke="hsl(0, 72%, 55%)" fill="url(#expenseGradDashboard)" strokeWidth={2} />
              <Line type="monotone" dataKey="saldo" stroke="#1E40AF" strokeWidth={2.2} dot={false} strokeDasharray="4 4" />
            </AreaChart></ResponsiveContainer></div>
          </CardContent></Card>

          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-primary" /><h2 className="font-heading text-sm font-bold">Categorias do mês</h2></div>
            {categoryDistribution.length === 0 ? (<p className="text-sm text-muted-foreground">Sem despesas no mês para exibir.</p>) : (
              <>
                <div className="h-60"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="78%" paddingAngle={2}>{categoryDistribution.map((item) => (<Cell key={item.key} fill={item.color} />))}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} /></PieChart></ResponsiveContainer></div>
                <div className="space-y-1.5">{categoryDistribution.map((item) => (<div key={item.key} className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5 text-xs"><div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="font-medium">{item.label}</span></div><span className="font-semibold">{item.percentage.toFixed(1)}%</span></div>))}</div>
              </>
            )}
          </CardContent></Card>
        </section>
        <section className="grid grid-cols-1 gap-4">
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <h2 className="font-heading text-sm font-bold">Volume de despesas e tendência</h2>
              {topExpenseCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem despesas para montar o gráfico por categoria.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_240px]">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stackedExpenseData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                          <Tooltip
                            formatter={(value: number, name: string) => {
                              const found = topExpenseCategories.find((cat) => `cat_${cat.id}` === name);
                              if (found) return [formatCurrency(value), found.label];
                              return [formatCurrency(value), "Total despesas"];
                            }}
                            contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                          />
                          {topExpenseCategories.map((cat) => (
                            <Bar key={cat.id} dataKey={`cat_${cat.id}`} stackId="expense" fill={cat.color} radius={[2, 2, 0, 0]} />
                          ))}
                          <Line type="monotone" dataKey="totalDespesas" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 rounded-xl border border-border/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
                      {topExpenseCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="font-medium">{cat.label}</span>
                          </div>
                          <span className="font-semibold">{formatCurrency(cat.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 border-t border-border/60 pt-2 text-xs font-semibold text-muted-foreground">
                    <span className="inline-block h-[3px] w-6 rounded-full bg-[#111827]" />
                    <span>Total despesas</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Pending bills */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                <h2 className="font-heading text-sm font-bold">Contas pendentes</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">{pendingTx.length}</Badge>
              </div>
              {pendingTx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Tudo pago neste mês.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {pendingTx.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                      <button
                        type="button"
                        disabled={togglingId === tx.id}
                        onClick={() => handleToggleStatus(tx)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground hover:border-success hover:text-success transition-all"
                        title="Marcar como pago"
                      >
                        {togglingId === tx.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : null}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{(tx as any).source || (tx as any).notes || "Sem descrição"}</p>
                        <p className="text-[10px] text-muted-foreground">{tx.categories?.name || ""} · {new Date(tx.transaction_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                      </div>
                      <p className={cn("text-sm font-bold shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
                        {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent transactions */}
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-sm font-bold">Últimas transações</h2>
                </div>
                <button onClick={() => navigate("/financas/transacoes")} className="text-xs font-semibold text-primary hover:underline">Ver todas</button>
              </div>
              {recentTx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhuma transação no mês.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {recentTx.map((tx) => {
                    const isPaid = tx.status === "paid";
                    return (
                      <div key={tx.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                        <button
                          type="button"
                          disabled={togglingId === tx.id}
                          onClick={() => handleToggleStatus(tx)}
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                            isPaid ? "border-success bg-success/15 text-success" : "border-muted-foreground/30 text-muted-foreground hover:border-success hover:text-success"
                          )}
                          title={isPaid ? "Voltar para pendente" : "Marcar como pago"}
                        >
                          {togglingId === tx.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : isPaid ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tx.type === "income" ? "bg-success/10" : "bg-destructive/10")}>
                          {tx.type === "income" ? <ArrowUpCircle className="h-3.5 w-3.5 text-success" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", isPaid && "line-through text-muted-foreground")}>{(tx as any).source || (tx as any).notes || "Sem descrição"}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.categories?.name || ""}</p>
                        </div>
                        <p className={cn("text-sm font-bold shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
                          {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

      {!isSimple && (
        <section>
          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2"><LineChartIcon className="h-4 w-4 text-primary" /><h2 className="font-heading text-sm font-bold">Tabela analítica por categoria</h2></div>
            {categoryRows.length === 0 ? (<p className="text-sm text-muted-foreground">Sem despesas no mês para compor a tabela.</p>) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-2 font-semibold">Categoria</th><th className="py-2 text-right font-semibold">Valor</th><th className="py-2 text-right font-semibold">%</th><th className="py-2 text-right font-semibold">Variação</th><th className="py-2 text-right font-semibold">Tendência</th></tr></thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                        <td className="py-2.5"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-medium">{row.label}</span></div></td>
                        <td className="py-2.5 text-right font-semibold">{formatCurrency(row.currentValue)}</td>
                        <td className="py-2.5 text-right">{row.percentage.toFixed(1)}%</td>
                        <td className={cn("py-2.5 text-right font-semibold", row.delta > 0 ? "text-destructive" : row.delta < 0 ? "text-success" : "text-muted-foreground")}>{row.delta >= 0 ? "+" : ""}{formatCurrency(row.delta)}</td>
                        <td className="py-2.5 text-right">{row.trend === "up" && <span className="font-semibold text-destructive">Subiu</span>}{row.trend === "down" && <span className="font-semibold text-success">Caiu</span>}{row.trend === "stable" && <span className="font-semibold text-muted-foreground">Estável</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </section>
      )}

        {isSimple ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h2 className="font-heading text-sm font-bold">Metas e reservas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {showGoalsOnSimple ? "Modo completo de metas aberto abaixo." : "Toque para abrir quando quiser reservar ou retirar valores."}
              </p>
              <button
                type="button"
                onClick={() => setShowGoalsOnSimple((prev) => !prev)}
                className="gradient-primary mt-3 inline-flex h-10 items-center rounded-xl border border-primary/30 px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
              >
                {showGoalsOnSimple ? "Ocultar metas" : "Abrir metas e reservas"}
              </button>
            </div>
            {showGoalsOnSimple && (
              <GoalsSection
                userId={userId}
                goals={goals}
                accounts={accounts}
                totalBalance={totalNetWorth}
                monthBalance={monthBalance}
                onReload={loadData}
              />
            )}
          </section>
        ) : (
          <GoalsSection
            userId={userId}
            goals={goals}
            accounts={accounts}
            totalBalance={totalNetWorth}
            monthBalance={monthBalance}
            onReload={loadData}
          />
        )}

      </div>
    </>
  );
};

export default FinanceDashboard;
