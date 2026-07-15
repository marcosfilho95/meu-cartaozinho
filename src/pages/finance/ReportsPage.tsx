import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Loader2, PieChart as PieChartIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { CATEGORY_COLORS, FinanceTx, fetchFinanceTransactions, getLastMonthKeys, getMonthLabel } from "@/lib/financeShared";

interface ReportsPageProps {
  userId: string;
}

const ReportsPage: React.FC<ReportsPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);

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

  const monthData = useMemo(() => {
    const keys = getLastMonthKeys(12);
    const map = Object.fromEntries(keys.map((key) => [key, { key, month: getMonthLabel(key), receitas: 0, despesas: 0 }]));
    transactions.forEach((tx) => {
      if (tx.status === "canceled") return;
      const key = tx.transaction_date.slice(0, 7);
      if (!map[key]) return;
      if (tx.type === "income") map[key].receitas += Number(tx.amount);
      if (tx.type === "expense") map[key].despesas += Number(tx.amount);
    });
    return keys.map((key) => map[key]);
  }, [transactions]);

  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    transactions.forEach((tx, index) => {
      if (tx.type !== "expense" || tx.status === "canceled") return;
      const key = tx.category_id || "uncategorized";
      const current = map.get(key) || {
        name: tx.categories?.name || "Sem categoria",
        value: 0,
        color: tx.categories?.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
      current.value += Number(tx.amount);
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [transactions]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
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
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-bold">Categorias no período</h2>
            </div>
            {categoryData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem despesas para exibir.</p>
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2}>
                        {categoryData.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {categoryData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <span className="font-bold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default ReportsPage;

