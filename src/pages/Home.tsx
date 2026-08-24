import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CreditCard, LineChart as LineChartIcon, PiggyBank, Plus, Target, Wallet } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppHeader } from "@/components/AppHeader";
import { FinanceSyncLoader } from "@/components/finance/FinanceSyncLoader";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import {
  fetchCartaozinhoMonthTotals,
  syncCartaozinhoIncomeMonth,
  type CartaozinhoMonthTotal,
} from "@/lib/finance/cartaozinhoSync";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { getMonthlySpendingGoal } from "@/lib/financeBudget";
import { buildFinancialPlan, fetchFinancialRuleVersions } from "@/lib/financialRules";
import { monthTitle, summarizeMonth, type MonthSummary } from "@/lib/financeInsights";
import { calculateNetWorth, calculateReserveMovement, type GoalMovement } from "@/lib/financeOverview";
import { fetchFinanceTransactions, getLastMonthKeys, monthKey, type FinanceTx } from "@/lib/financeShared";
import { getFinanceViewCache, setFinanceViewCache } from "@/lib/financeViewCache";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { cn } from "@/lib/utils";

interface HomeProps {
  userId: string;
}

type HomeData = {
  transactions: FinanceTx[];
  summary: MonthSummary;
  reserved: number;
  netWorth: ReturnType<typeof calculateNetWorth>;
  card: CartaozinhoMonthTotal;
  spendingGoal: number;
};

const emptyCardTotal = (refMonth: string): CartaozinhoMonthTotal => ({ refMonth, total: 0, installments: 0, people: 0 });

const Home: React.FC<HomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const headerProfile = useUserHeaderProfile(userId);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HomeData>(() => ({
    transactions: [],
    summary: summarizeMonth([], selectedMonth),
    reserved: 0,
    netWorth: { assets: 0, goals: 0, debts: 0, total: 0 },
    card: emptyCardTotal(selectedMonth),
    spendingGoal: 0,
  }));

  const load = useCallback(async () => {
    if (!userId) return;
    const cacheKey = `home:${userId}:${selectedMonth}`;
    const cached = getFinanceViewCache<HomeData>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
      await syncCartaozinhoIncomeMonth(userId, selectedMonth);

      const [accountsRes, goalsRes, goalTxRes, budgetsRes, transactions, cardTotals, financialRules] = await Promise.all([
        supabase.from("accounts").select("type, current_balance, include_in_net_worth").eq("user_id", userId).eq("is_active", true),
        supabase.from("goals").select("current_amount").eq("user_id", userId),
        untypedSupabase.from("goal_transactions").select("amount, type, created_at").eq("user_id", userId).limit(1000),
        supabase.from("budgets").select("category_id, limit_amount").eq("user_id", userId).eq("ref_month", selectedMonth),
        fetchFinanceTransactions(userId, 24),
        fetchCartaozinhoMonthTotals(userId, [selectedMonth]),
        fetchFinancialRuleVersions(userId, selectedMonth),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (goalTxRes.error) throw goalTxRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      const reserve = calculateReserveMovement((goalTxRes.data || []) as GoalMovement[], selectedMonth);
      const monthSummary = summarizeMonth(transactions, selectedMonth);
      const financialPlan = buildFinancialPlan(
        financialRules,
        selectedMonth,
        monthSummary.income,
        getMonthlySpendingGoal(budgetsRes.data || []),
      );
      setData({
        transactions,
        summary: monthSummary,
        reserved: Math.max(reserve.net, 0),
        netWorth: calculateNetWorth(accountsRes.data || [], goalsRes.data || []),
        card: cardTotals[selectedMonth] || emptyCardTotal(selectedMonth),
        spendingGoal: financialPlan.spendingLimit,
      });
    } catch (loadError) {
      console.error("Home load error", loadError);
      setError(getErrorMessage(loadError, "Não foi possível carregar sua visão financeira."));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onFinanceUpdate = () => void load();
    window.addEventListener("finance-sync-updated", onFinanceUpdate);
    return () => window.removeEventListener("finance-sync-updated", onFinanceUpdate);
  }, [load]);

  const historyKeys = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return getLastMonthKeys(6, new Date(year, month - 1, 15));
  }, [selectedMonth]);

  const evolution = useMemo(() => historyKeys.map((key) => {
    const summary = summarizeMonth(data.transactions, key);
    return { key, month: `${key.slice(5, 7)}/${key.slice(2, 4)}`, receitas: summary.income, despesas: -summary.expenses, resultado: summary.result };
  }), [data.transactions, historyKeys]);

  const hasMonthData = data.summary.hasData || data.reserved > 0 || data.card.total > 0;
  const goalUsage = data.spendingGoal > 0 ? Math.min((data.summary.expenses / data.spendingGoal) * 100, 999) : null;
  const metricCards = [
    { label: "Receitas", value: data.summary.income, tone: "text-success" },
    { label: "Despesas", value: data.summary.expenses, tone: "text-foreground" },
    { label: "Resultado", value: data.summary.result, tone: data.summary.result >= 0 ? "text-success" : "text-destructive" },
    { label: "Reservado para planos", value: data.reserved, tone: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <AppHeader title="Meu Cartãozinho" greeting={headerProfile.greeting} userName={headerProfile.firstName} avatarId={headerProfile.avatarId} avatarUrl={headerProfile.avatarUrl} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pt-6 animate-fade-in sm:px-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Visão financeira</p>
            <h1 className="mt-2 max-w-2xl font-heading text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">Entenda seu mês e transforme planos em progresso.</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Organize receitas, gastos e objetivos em uma revisão mensal simples.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <MonthNavigator currentMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            <Button onClick={() => navigate(`/financas/fechamento?mes=${selectedMonth}`)} className="gap-2"><LineChartIcon className="h-4 w-4" /> Revisar mês</Button>
          </div>
        </header>

        {error && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => void load()}>Tentar novamente</Button></CardContent></Card>}

        {loading ? (
          <FinanceSyncLoader monthLabel={monthTitle(selectedMonth)} />
        ) : !hasMonthData ? (
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-elevated">
            <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{monthTitle(selectedMonth)}</p><h2 className="mt-2 font-heading text-2xl">Revise os valores deste mês</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Informe sua renda, faturas e despesas para visualizar o resultado e planejar seus objetivos.</p></div>
              <Button size="lg" onClick={() => navigate(`/financas/fechamento?mes=${selectedMonth}`)}>Começar agora</Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => <Card key={metric.label} className="border-border/70 shadow-card"><CardContent className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p><p className={cn("mt-2 text-2xl font-bold tabular-nums", metric.tone)}>{formatCurrency(metric.value)}</p></CardContent></Card>)}
          </section>
        )}

        {!loading && (
          <>
          <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="border-border/70 shadow-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-heading text-lg font-bold">Evolução financeira</h2><p className="mt-1 text-xs text-muted-foreground">Receitas acima, despesas abaixo e linha do resultado · últimos seis meses.</p></div>
              </div>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolution} stackOffset="sign" margin={{ top: 8, right: 4, left: -18, bottom: 12 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.25} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value: number, name: string) => [formatCurrency(name === "Despesas" ? Math.abs(value) : value), name]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="receitas" name="Receitas" stackId="movimento" barSize={28} fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" stackId="movimento" barSize={28} fill="hsl(var(--destructive))" fillOpacity={0.76} radius={[0, 0, 4, 4]} />
                    <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={{ r: 2.5, fill: "hsl(var(--card))" }} activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-primary text-primary-foreground shadow-elevated">
            <CardContent className="flex h-full flex-col p-5">
              <div className="flex items-center gap-2 text-primary-foreground/75"><Target className="h-4 w-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Qualidade financeira</p></div>
              <p className="mt-4 font-heading text-3xl">{data.summary.savingsRate.toFixed(0)}%</p><p className="text-sm text-primary-foreground/75">da renda ficou disponível neste mês.</p>
              <div className="mt-5 space-y-3 border-t border-primary-foreground/15 pt-4 text-xs">
                <div className="flex justify-between gap-3"><span className="text-primary-foreground/65">Gastos fixos</span><strong>{formatCurrency(data.summary.fixedExpenses)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-primary-foreground/65">Gastos variáveis</span><strong>{formatCurrency(data.summary.variableExpenses)}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-primary-foreground/65">Meta utilizada</span><strong>{goalUsage === null ? "Defina uma meta" : `${goalUsage.toFixed(0)}%`}</strong></div>
              </div>
              <Button variant="secondary" className="mt-auto gap-2" onClick={() => navigate("/financas")}>Ver análise completa <ArrowUpRight className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <button type="button" onClick={() => navigate("/cards")} className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated">
            <div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" /></div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cartões e faturas</p><h2 className="mt-1 font-heading text-xl font-bold">Meu Cartãozinho</h2><p className="mt-3 text-2xl font-bold text-primary">{formatCurrency(data.card.total)}</p><p className="mt-1 text-xs text-muted-foreground">Total de {monthTitle(selectedMonth).toLocaleLowerCase("pt-BR")} · mesmo valor usado no Organizador{data.card.people > 0 ? ` · ${data.card.people} ${data.card.people === 1 ? "pessoa" : "pessoas"}` : ""}</p>
          </button>

          <button type="button" onClick={() => navigate("/financas")} className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated">
            <div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 text-primary"><Wallet className="h-5 w-5" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" /></div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Organização mensal</p><h2 className="mt-1 font-heading text-xl font-bold">Organizador</h2><p className={cn("mt-3 text-2xl font-bold", data.summary.result >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(data.summary.result)}</p><p className="mt-1 text-xs text-muted-foreground">Resultado do mês{data.reserved > 0 ? ` · ${formatCurrency(data.reserved)} reservado para planos` : ""}</p>
          </button>
        </section>

        <Card className="border-border/70 shadow-card"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><PiggyBank className="h-5 w-5" /></div><div><h2 className="font-heading font-bold">Seus planos</h2><p className="text-xs text-muted-foreground">{data.netWorth.goals > 0 ? `${formatCurrency(data.netWorth.goals)} já guardados em cofrinhos.` : "Crie uma viagem, reserva ou compra futura e acompanhe o progresso."}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate("/financas/cofrinhos")}><PiggyBank className="mr-2 h-4 w-4" /> Ver planos</Button><Button onClick={() => navigate(`/financas/fechamento?mes=${selectedMonth}`)}><Plus className="mr-2 h-4 w-4" /> Revisar mês</Button></div></CardContent></Card>

        <p className="pb-3 text-center text-[11px] text-muted-foreground">Patrimônio estimado: <span className={cn("font-semibold", data.netWorth.total >= 0 ? "text-foreground" : "text-destructive")}>{formatCurrency(data.netWorth.total)}</span></p>
          </>
        )}
      </main>
    </div>
  );
};

export default Home;
