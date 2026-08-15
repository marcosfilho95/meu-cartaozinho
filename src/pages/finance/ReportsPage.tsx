import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CreditCard, Loader2, PieChart as PieChartIcon, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { FinanceTx, fetchFinanceTransactions, getLastMonthKeys } from "@/lib/financeShared";
import { buildExpenseBreakdown, buildMonthlyEvolution, buildSavingsTrend } from "@/lib/financeAnalytics";

interface ReportsPageProps {
  userId: string;
}

const RANGES = [3, 6, 12] as const;

const ReportsPage: React.FC<ReportsPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [range, setRange] = useState<number>(6);
  const [dimension, setDimension] = useState<"category" | "account">("category");

  useEffect(() => {
    let mounted = true;
    fetchFinanceTransactions(userId, 12)
      .then((data) => {
        if (mounted) setTransactions(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const monthKeys = useMemo(() => getLastMonthKeys(range), [range]);
  const monthData = useMemo(() => buildMonthlyEvolution(transactions, monthKeys), [transactions, monthKeys]);
  const breakdown = useMemo(
    () => buildExpenseBreakdown(transactions, dimension, { months: monthKeys }),
    [transactions, dimension, monthKeys],
  );
  const trend = useMemo(() => buildSavingsTrend(monthData), [monthData]);

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
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sobra do último mês</p>
            <p className={`font-heading text-xl font-bold ${trend.current >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(trend.current)}
            </p>
            <Badge variant="outline" className={`gap-1 ${trendPositive ? "text-success" : trend.direction === "spending" ? "text-destructive" : ""}`}>
              <TrendIcon className="h-3 w-3" />
              {trend.direction === "stable"
                ? "Estável em relação ao mês anterior"
                : `${trendPositive ? "Poupando" : "Gastando"} ${formatCurrency(Math.abs(trend.delta))} a ${trendPositive ? "mais" : "menos de sobra"}`}
            </Badge>
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
                  {dimension === "category" ? "Gastos por categoria" : "Gastos por cartão/conta"}
                </h2>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant={dimension === "category" ? "default" : "outline"} onClick={() => setDimension("category")}>
                  Categorias
                </Button>
                <Button size="sm" variant={dimension === "account" ? "default" : "outline"} onClick={() => setDimension("account")}>
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
              <p className="text-xs text-muted-foreground">Acima de zero você poupou; abaixo, gastou mais do que recebeu.</p>
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
                <Line type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2.4} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;

