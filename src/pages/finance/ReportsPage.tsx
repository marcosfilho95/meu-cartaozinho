import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CreditCard, Loader2, PieChart as PieChartIcon, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { FinanceTx, fetchFinanceTransactions, getLastMonthKeys } from "@/lib/financeShared";
import { buildExpenseBreakdown, buildMonthlyEvolution, buildSavingsTrend } from "@/lib/financeAnalytics";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import type { GoalMovement } from "@/lib/financeOverview";

interface ReportsPageProps {
  userId: string;
}

const RANGES = [3, 6, 12] as const;

const ReportsPage: React.FC<ReportsPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>([]);
  const [range, setRange] = useState<number>(6);
  const [dimension, setDimension] = useState<"category" | "card">("category");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchFinanceTransactions(userId, 12),
      untypedSupabase
        .from("goal_transactions")
        .select("amount, type, ref_month, created_at")
        .eq("user_id", userId)
        .limit(1000),
    ])
      .then(([data, goalMovementResult]) => {
        if (!mounted) return;
        setTransactions(data);
        setGoalMovements((goalMovementResult.data || []) as GoalMovement[]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const monthKeys = useMemo(() => getLastMonthKeys(range), [range]);
  const monthData = useMemo(
    () => buildMonthlyEvolution(transactions, monthKeys, goalMovements),
    [goalMovements, monthKeys, transactions],
  );
  const breakdown = useMemo(
    () => buildExpenseBreakdown(transactions, dimension, { months: monthKeys }),
    [transactions, dimension, monthKeys],
  );
  const trend = useMemo(() => buildSavingsTrend(monthData), [monthData]);
  const latest = monthData[monthData.length - 1];

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const trendPositive = trend.direction === "saving";
  const TrendIcon = trendPositive ? TrendingUp : trend.direction === "spending" ? TrendingDown : BarChart3;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-bold">Relatórios</h1>
          <p className="text-xs text-muted-foreground">Compare gastos por categoria e cartão e veja se você está poupando mais.</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={range === option ? "default" : "outline"}
              onClick={() => setRange(option)}
            >
              {option}m
            </Button>
          ))}
        </div>
      </section>

      <Card className="border-0 shadow-card">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sobra do último mês</p>
            <p className={`font-heading text-xl font-bold ${trend.current >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(trend.current)}
            </p>
            <Badge variant="outline" className={`gap-1 ${trendPositive ? "text-success" : trend.direction === "spending" ? "text-destructive" : ""}`}>
              <TrendIcon className="h-3 w-3" />
              {trend.direction === "stable"
                ? "Estável em relação ao mês anterior"
                : `${formatCurrency(Math.abs(trend.delta))} ${trendPositive ? "a mais" : "a menos"} de sobra`}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cofrinhos no último mês</p>
            <p className={`font-heading text-xl font-bold ${(latest?.reservaLiquida || 0) >= 0 ? "text-success" : "text-destructive"}`}>
              {(latest?.reservaLiquida || 0) > 0 ? "+" : ""}{formatCurrency(latest?.reservaLiquida || 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(latest?.aportes || 0)} guardados · {formatCurrency(latest?.retiradas || 0)} retirados
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Média de sobra no período</p>
            <p className="font-heading text-xl font-bold">{formatCurrency(trend.average)}</p>
            <p className="text-[11px] text-muted-foreground">Últimos {range} meses</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Variação das despesas</p>
            <p className={`font-heading text-xl font-bold ${trend.expensesDelta <= 0 ? "text-success" : "text-destructive"}`}>
              {trend.expensesDelta > 0 ? "+" : ""}{formatCurrency(trend.expensesDelta)}
            </p>
            <p className="text-[11px] text-muted-foreground">Comparado ao mês anterior</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-0 shadow-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-bold">Receitas x despesas</h2>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="receitas" fill="hsl(152, 55%, 42%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="despesas" fill="hsl(0, 72%, 55%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {dimension === "category" ? <PieChartIcon className="h-4 w-4 text-primary" /> : <CreditCard className="h-4 w-4 text-primary" />}
                <h2 className="font-heading text-base font-bold">
                  {dimension === "category" ? "Gastos por categoria" : "Gastos por cartão"}
                </h2>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant={dimension === "category" ? "default" : "outline"} onClick={() => setDimension("category")}>
                  Categorias
                </Button>
                <Button size="sm" variant={dimension === "card" ? "default" : "outline"} onClick={() => setDimension("card")}>
                  Cartões
                </Button>
              </div>
            </div>
            {breakdown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem despesas para exibir.</p>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2}>
                        {breakdown.map((item) => (
                          <Cell key={item.key} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {breakdown.map((item) => (
                    <div key={item.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                        <span className="font-bold">{formatCurrency(item.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-0 shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <h2 className="font-heading text-base font-bold">Evolução da sobra</h2>
              <p className="text-xs text-muted-foreground">A sobra mostra receitas menos despesas; a linha dos cofrinhos mostra o que foi realmente guardado ou retirado.</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Line type="monotone" dataKey="saldo" name="Sobra do mês" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="reservaLiquida" name="Cofrinhos" stroke="hsl(152, 55%, 42%)" strokeWidth={2.2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-[11px] text-muted-foreground">
        O mês atual pode estar incompleto. Despesas são agrupadas pelo mês de referência do lançamento, não pelo pagamento da fatura.
      </p>
    </div>
  );
};

export default ReportsPage;

