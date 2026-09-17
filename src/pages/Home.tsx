import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CreditCard, LineChart as LineChartIcon, PiggyBank, Target, Wallet } from "lucide-react";



import { AppHeader } from "@/components/AppHeader";
import { FinanceSyncLoader } from "@/components/finance/FinanceSyncLoader";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppFooter } from "@/components/AppFooter";
import { getGoalIcon } from "@/components/finance/goalVisuals";
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
import { fetchFinanceTransactions, monthKey, type FinanceTx } from "@/lib/financeShared";
import { getFinanceViewCache, setFinanceViewCache } from "@/lib/financeViewCache";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { cn } from "@/lib/utils";
import { subscribeFinanceSync } from "@/lib/financeSyncBus";
import { PrivacyValue } from "@/hooks/use-privacy-mode";
import { ProductExplainerDialog } from "@/components/ProductExplainerDialog";

interface HomeProps {
  userId: string;
}

type HomeGoal = {
  id: string;
  name: string;
  goal_type?: string | null;
  saved: number;
  target: number;
  progress: number;
};

type HomeData = {
  transactions: FinanceTx[];
  summary: MonthSummary;
  reserved: number;
  netWorth: ReturnType<typeof calculateNetWorth>;
  card: CartaozinhoMonthTotal;
  spendingGoal: number;
  goals: HomeGoal[];
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
    goals: [],
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
        supabase.from("goals").select("id, name, goal_type, target_amount, current_amount, is_completed").eq("user_id", userId),
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
      const nextData: HomeData = {
        transactions,
        summary: monthSummary,
        reserved: Math.max(reserve.net, 0),
        netWorth: calculateNetWorth(accountsRes.data || [], goalsRes.data || []),
        card: cardTotals[selectedMonth] || emptyCardTotal(selectedMonth),
        spendingGoal: financialPlan.spendingLimit,
        goals: ((goalsRes.data || []) as Array<{ id: string; name: string; goal_type?: string | null; target_amount: number; current_amount: number; is_completed?: boolean }>)
          .filter((goal) => !goal.is_completed)
          .map((goal) => {
            const saved = Math.max(Number(goal.current_amount) || 0, 0);
            const target = Math.max(Number(goal.target_amount) || 0, 0);
            return { id: goal.id, name: goal.name, goal_type: goal.goal_type, saved, target, progress: target > 0 ? Math.min((saved / target) * 100, 100) : 0 };
          })
          .sort((a, b) => (b.saved - a.saved) || (b.progress - a.progress) || a.name.localeCompare(b.name, "pt-BR")),
      };
      setData(nextData);
      setFinanceViewCache(`home:${userId}:${selectedMonth}`, nextData);
    } catch (loadError) {
      console.error("Home load error", loadError);
      if (!cached) setError(getErrorMessage(loadError, "Não foi possível carregar sua visão financeira."));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    return subscribeFinanceSync(() => void load());
  }, [load]);


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
      <AppHeader title="Meu Cartãozinho" greeting={headerProfile.greeting} userName={headerProfile.firstName} avatarId={headerProfile.avatarId} avatarUrl={headerProfile.avatarUrl} avatarPending={!headerProfile.resolved} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pt-6 animate-fade-in sm:px-6">
        <header className="page-title-shell flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="page-title-content">
            <p className="page-title-eyebrow">Sua vida financeira, em um só lugar</p>
            <h1 className="page-title-heading">Clareza para decidir. Liberdade para viver.</h1>
            <p className="page-title-description">Uma visão completa do seu mês para decidir com clareza e avançar com intenção.</p>
          </div>
          <div className="page-title-content flex flex-col gap-2 sm:flex-row sm:items-center">
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
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{monthTitle(selectedMonth)}</p><h2 className="mt-2 font-heading text-2xl">Seu mês começa com clareza</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Reúna renda, faturas e despesas para descobrir o que seu dinheiro pode realizar.</p></div>
              <Button size="lg" onClick={() => navigate(`/financas/fechamento?mes=${selectedMonth}`)}>Organizar meu mês</Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => <Card key={metric.label} className="border-border/70 shadow-card"><CardContent className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p><p className={cn("mt-2 text-2xl font-bold tabular-nums", metric.tone)}><PrivacyValue>{formatCurrency(metric.value)}</PrivacyValue></p></CardContent></Card>)}
          </section>
        )}

        {!loading && (
          <>
          <Card className="border-border/70 bg-primary text-primary-foreground shadow-elevated">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-primary-foreground/75"><Target className="h-4 w-4" /><p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Seu espaço para avançar</p></div>
                <p className="mt-2 font-heading text-3xl"><PrivacyValue>{data.summary.savingsRate.toFixed(0)}%</PrivacyValue></p>
                <p className="text-sm text-primary-foreground/75">da sua renda segue disponível para suas escolhas.</p>
              </div>
              <div className="grid gap-2 text-xs sm:text-right">
                <div className="flex justify-between gap-6 sm:justify-end"><span className="text-primary-foreground/65">Gastos fixos</span><strong><PrivacyValue>{formatCurrency(data.summary.fixedExpenses)}</PrivacyValue></strong></div>
                <div className="flex justify-between gap-6 sm:justify-end"><span className="text-primary-foreground/65">Gastos variáveis</span><strong><PrivacyValue>{formatCurrency(data.summary.variableExpenses)}</PrivacyValue></strong></div>
                <div className="flex justify-between gap-6 sm:justify-end"><span className="text-primary-foreground/65">Meta utilizada</span><strong>{goalUsage === null ? "Defina uma meta" : <PrivacyValue>{goalUsage.toFixed(0)}%</PrivacyValue>}</strong></div>
                <Button variant="secondary" size="sm" className="mt-1 gap-2 sm:justify-self-end" onClick={() => navigate("/financas")}>Descobrir oportunidades <ArrowUpRight className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>


        <section className="grid gap-4 md:grid-cols-2">
          <div className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated">
            <button type="button" onClick={() => navigate("/cards")} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" /></div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Controle compartilhado</p><h2 className="mt-1 font-heading text-xl font-bold">Meu Cartãozinho</h2><p className="mt-3 text-2xl font-bold text-primary"><PrivacyValue>{formatCurrency(data.card.total)}</PrivacyValue></p><p className="mt-1 text-xs text-muted-foreground">Acompanhe compras por pessoa e saiba quem gastou o quê{data.card.people > 0 ? ` · ${data.card.people} ${data.card.people === 1 ? "pessoa" : "pessoas"} acompanhadas` : ""}</p></button>
            <div className="mt-4 border-t border-border/60 pt-2"><ProductExplainerDialog product="cartaozinho" /></div>
          </div>

          <div className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated">
            <button type="button" onClick={() => navigate("/financas")} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 text-primary"><Wallet className="h-5 w-5" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" /></div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Controle financeiro</p><h2 className="mt-1 font-heading text-xl font-bold">Organizador</h2><p className={cn("mt-3 text-2xl font-bold", data.summary.result >= 0 ? "text-success" : "text-destructive")}><PrivacyValue>{formatCurrency(data.summary.result)}</PrivacyValue></p><p className="mt-1 text-xs text-muted-foreground">Sua planilha de receitas, despesas e planos{data.reserved > 0 ? " · valor reservado para planos" : ""}</p></button>
            <div className="mt-4 border-t border-border/60 pt-2"><ProductExplainerDialog product="organizador" /></div>
          </div>
        </section>

        <Card className="border-border/70 shadow-card">
          <CardContent className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-bold">Planos que ganham forma</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Cada valor guardado aproxima você do que realmente importa.</p>
              </div>
              <PiggyBank className="h-4 w-4 shrink-0 text-primary" />
            </div>

            {data.goals.length ? (
              <div className="mt-4 space-y-3">
                {data.goals.slice(0, 4).map((goal) => {
                  const GoalIcon = getGoalIcon({ name: goal.name, goal_type: goal.goal_type });
                  return (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 truncate font-medium"><GoalIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />{goal.name}</span>
                        {goal.target > 0 ? <strong className="text-primary">{goal.progress.toFixed(0)}%</strong> : <strong className="text-primary"><PrivacyValue>{formatCurrency(goal.saved)}</PrivacyValue></strong>}
                      </div>
                      {goal.target > 0 && (
                        <>
                          <Progress value={goal.progress} className="mt-1.5 h-2" />
                          <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground">
                            <span><PrivacyValue>{formatCurrency(goal.saved)}</PrivacyValue> guardados</span>
                            <span>Faltam <PrivacyValue>{formatCurrency(Math.max(goal.target - goal.saved, 0))}</PrivacyValue></span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
                <p className="text-sm font-medium">Seu próximo plano começa aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">Dê um destino ao seu dinheiro e acompanhe cada passo até realizá-lo.</p>
              </div>
            )}

            <Button className="mt-5 w-full" onClick={() => navigate("/financas/cofrinhos")}>
              {data.goals.length ? "Impulsionar meus planos" : "Tirar um plano do papel"} <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">Patrimônio estimado: <span className={cn("font-semibold", data.netWorth.total >= 0 ? "text-foreground" : "text-destructive")}><PrivacyValue>{formatCurrency(data.netWorth.total)}</PrivacyValue></span></p>
          </>
        )}
      </main>

      <AppFooter plain className="pb-2 pt-4" />
    </div>
  );
};

export default Home;
