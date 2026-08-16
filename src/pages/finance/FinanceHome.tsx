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
  ArrowUpCircle,
  BarChart3,
  CalendarRange,
  CreditCard,
  Loader2,
  PiggyBank,
  Repeat,
  Upload,
  Wallet,
} from "lucide-react";

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
import { calculateMonthlyResult, calculateNetWorth } from "@/lib/financeOverview";
import { cn } from "@/lib/utils";

interface FinanceHomeProps {
  userId: string;
}

type FixedExpense = {
  id: string;
  amount: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  template_payload: { amount?: number } | null;
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

const FinanceHome: React.FC<FinanceHomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [refMonth, setRefMonth] = useState(() => monthKey(new Date()));
  const [chartRange, setChartRange] = useState<6 | 12>(6);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
    try {
      const [txs, accountsRes, goalsRes, recurrencesRes] = await Promise.all([
        fetchFinanceTransactions(userId, 12),
        supabase
          .from("accounts")
          .select("id, name, type, current_balance, include_in_net_worth")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase.from("goals").select("current_amount").eq("user_id", userId),
        untypedSupabase
          .from("recurrences")
          .select("id, amount, frequency, template_payload")
          .eq("user_id", userId)
          .eq("is_active", true),
      ]);
      setTransactions(txs || []);
      setAccounts((accountsRes.data || []) as AccountRow[]);
      setGoals((goalsRes.data || []) as GoalRow[]);
      setFixedExpenses((recurrencesRes.data || []) as FixedExpense[]);
    } catch {
      toast.error("Não foi possível carregar o resumo financeiro.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [load, userId]);

  useEffect(() => {
    const onSync = () => void load();
    window.addEventListener("finance-sync-updated", onSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onSync as EventListener);
  }, [load]);

  const monthSummary = useMemo(
    () => calculateMonthlyResult(transactions, refMonth),
    [refMonth, transactions],
  );
  const netWorth = useMemo(() => calculateNetWorth(accounts, goals), [accounts, goals]);
  const income = monthSummary.income;
  const expenses = monthSummary.expenses;
  const balance = monthSummary.result;

  const evolutionMonths = useMemo(
    () => getLastMonthKeys(chartRange, new Date(`${refMonth}-15T12:00:00`)),
    [chartRange, refMonth],
  );
  const evolutionData = useMemo(
    () => buildMonthlyEvolution(transactions, evolutionMonths).map((point) => ({
      ...point,
      despesasNegativas: point.despesas > 0 ? -point.despesas : 0,
    })),
    [evolutionMonths, transactions],
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

  const monthlyFixedExpenses = useMemo(
    () => fixedExpenses.filter((item) => item.frequency === "monthly"),
    [fixedExpenses],
  );
  const fixedMonthlyTotal = useMemo(
    () => monthlyFixedExpenses.reduce(
      (sum, item) => sum + Number(item.amount ?? item.template_payload?.amount ?? 0),
      0,
    ),
    [monthlyFixedExpenses],
  );
  const fixedIncomeShare = income > 0 ? (fixedMonthlyTotal / income) * 100 : 0;

  const selectableMonths = useMemo(() => {
    const current = monthKey(new Date());
    return [addMonthsToKey(current, 1), current, ...Array.from({ length: 11 }, (_, index) => addMonthsToKey(current, -(index + 1)))];
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Organizador</p>
          <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight capitalize">
            {fullMonthLabel(refMonth)}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">O essencial do mês: entradas, saídas e resultado.</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <ArrowUpCircle className="h-5 w-5 text-success" />
            <p className="mt-2 text-[11px] text-muted-foreground">Receitas do mês</p>
            <p className="text-xl font-bold text-success">{formatCurrency(income)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <ArrowDownCircle className="h-5 w-5 text-destructive" />
            <p className="mt-2 text-[11px] text-muted-foreground">Despesas do mês</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(expenses)}</p>
            {monthSummary.pendingExpenses > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatCurrency(monthSummary.pendingExpenses)} pendentes no mês
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <PiggyBank className="h-5 w-5 text-primary" />
            <p className="mt-2 text-[11px] text-muted-foreground">Resultado do mês</p>
            <p className={cn("text-xl font-bold", balance >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(balance)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {balance >= 0 ? "Você gastou menos do que recebeu" : "Você gastou mais do que recebeu"}
            </p>
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

      <Card className="border-0 shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-heading text-base font-bold">Evolução financeira</h2>
                <p className="text-[11px] text-muted-foreground">Receitas para cima, despesas para baixo e resultado em linha.</p>
              </div>
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-1">
              <button type="button" className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", chartRange === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(6)}>6M</button>
              <button type="button" className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", chartRange === 12 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(12)}>12M</button>
            </div>
          </div>
          <div className="mt-4 h-72">
            {hasEvolutionData ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={evolutionData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.35} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(name === "Despesas" ? Math.abs(Number(value)) : Number(value)),
                      name,
                    ]}
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" fillOpacity={0.82} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="despesasNegativas" name="Despesas" fill="hsl(var(--destructive))" fillOpacity={0.72} radius={[0, 0, 3, 3]} />
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

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-heading text-base font-bold">Gastos por cartão</h2>
                <p className="text-[11px] capitalize text-muted-foreground">{fullMonthLabel(refMonth)}</p>
              </div>
            </div>
            {cardTotal > 0 ? (
              <div className="grid items-center gap-2 sm:grid-cols-[240px_1fr]">
                <div className="relative h-56">
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
                <div className="space-y-2">
                  {cardBreakdown.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 text-center">
                <CreditCard className="mb-2 h-7 w-7 text-muted-foreground/50" />
                <p className="text-sm font-medium">Nenhum gasto em cartão neste mês</p>
                <p className="mt-1 text-xs text-muted-foreground">Importe uma fatura para ver a distribuição.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="flex h-full flex-col p-4">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-bold">Despesas fixas</h2>
            </div>
            <div className="flex flex-1 flex-col justify-center py-6">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Compromisso mensal</p>
              <p className="mt-1 font-heading text-3xl font-extrabold">{formatCurrency(fixedMonthlyTotal)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {monthlyFixedExpenses.length} despesa(s) mensal(is) cadastrada(s)
                {income > 0 ? ` · ${fixedIncomeShare.toFixed(1)}% das receitas do mês` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-9 w-full text-xs" onClick={() => navigate("/financas/recorrencias")}>
              Gerenciar despesas fixas
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default FinanceHome;
