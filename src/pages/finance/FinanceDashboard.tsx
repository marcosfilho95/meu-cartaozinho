import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, Wallet, AlertTriangle, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { ExpenseDistributionBar } from "@/components/finance/ExpenseDistributionBar";
import { CategoryTable } from "@/components/finance/CategoryTable";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";
import { getStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile } from "@/lib/profileCache";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

const CHART_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#F0B27A", "#BB8FCE", "#AEB6BF", "#82E0AA"];

interface FinanceDashboardProps {
  userId: string;
}

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ balance: 0, income: 0, expense: 0, pending: 0, pendingCount: 0 });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [lastMonthCategoryBreakdown, setLastMonthCategoryBreakdown] = useState<any[]>([]);
  const [monthlyEvolution, setMonthlyEvolution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ name: string; avatar_id: string | null }>({ name: "", avatar_id: null });
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());

  useEffect(() => {
    const cached = getStoredProfile(userId);
    if (cached) {
      setProfile({ name: cached.name, avatar_id: cached.avatar_id ?? getStoredAvatarId(userId) ?? null });
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

      // Last month
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
      const lastMonthEnd = monthStart;

      // 6 months back for evolution
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const sixMonthsStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

      const [profileRes, accsRes, txRes, lastTxRes, evolutionRes, catsRes] = await Promise.all([
        supabase.from("profiles").select("name, avatar_id").eq("user_id", userId).maybeSingle(),
        supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("transactions").select("*, categories(name, color, icon)").eq("user_id", userId).is("deleted_at", null)
          .gte("transaction_date", monthStart).lt("transaction_date", monthEnd).order("transaction_date", { ascending: false }),
        supabase.from("transactions").select("*, categories(name, color)").eq("user_id", userId).is("deleted_at", null)
          .gte("transaction_date", lastMonthStart).lt("transaction_date", lastMonthEnd),
        supabase.from("transactions").select("type, amount, status, transaction_date").eq("user_id", userId).is("deleted_at", null)
          .gte("transaction_date", sixMonthsStart).lt("transaction_date", monthEnd),
        supabase.from("categories").select("id, name, color").eq("user_id", userId),
      ]);

      if (profileRes.data) {
        setProfile({ name: profileRes.data.name || "", avatar_id: profileRes.data.avatar_id });
      }

      const accs = accsRes.data || [];
      const txs = txRes.data || [];
      const lastTxs = lastTxRes.data || [];
      const allTxs = evolutionRes.data || [];
      setAccounts(accs);
      setRecentTransactions(txs.slice(0, 5));

      const totalBalance = accs.reduce((s: number, a: any) => s + (a.include_in_net_worth ? Number(a.current_balance) : 0), 0);
      const income = txs.filter((t: any) => t.type === "income" && t.status !== "canceled").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const expense = txs.filter((t: any) => t.type === "expense" && t.status !== "canceled").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const pendingTxs = txs.filter((t: any) => t.status === "pending");
      const pending = pendingTxs.reduce((s: number, t: any) => s + Number(t.amount), 0);
      setSummary({ balance: totalBalance, income, expense, pending, pendingCount: pendingTxs.length });

      // Category breakdown (current month expenses)
      const catMap: Record<string, { name: string; color: string; value: number }> = {};
      txs.filter((t: any) => t.type === "expense" && t.status !== "canceled").forEach((t: any) => {
        const catName = t.categories?.name || "Sem categoria";
        const catColor = t.categories?.color || "#AEB6BF";
        const catId = t.category_id || "uncategorized";
        if (!catMap[catId]) catMap[catId] = { name: catName, color: catColor, value: 0 };
        catMap[catId].value += Number(t.amount);
      });
      const breakdown = Object.entries(catMap).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.value - a.value);
      setCategoryBreakdown(breakdown);

      // Last month breakdown
      const lastCatMap: Record<string, number> = {};
      lastTxs.filter((t: any) => t.type === "expense" && t.status !== "canceled").forEach((t: any) => {
        const catId = t.category_id || "uncategorized";
        lastCatMap[catId] = (lastCatMap[catId] || 0) + Number(t.amount);
      });
      setLastMonthCategoryBreakdown(
        Object.entries(lastCatMap).map(([id, value]) => ({ id, value }))
      );

      // Monthly evolution (6 months)
      const monthMap: Record<string, { income: number; expense: number }> = {};
      allTxs.forEach((t: any) => {
        if (t.status === "canceled") return;
        const m = t.transaction_date.slice(0, 7);
        if (!monthMap[m]) monthMap[m] = { income: 0, expense: 0 };
        if (t.type === "income") monthMap[m].income += Number(t.amount);
        if (t.type === "expense") monthMap[m].expense += Number(t.amount);
      });
      const evolution = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month: new Date(month + "-15").toLocaleDateString("pt-BR", { month: "short" }),
          receitas: data.income,
          despesas: data.expense,
        }));
      setMonthlyEvolution(evolution);

      setLoading(false);
    };
    load();
  }, [userId]);

  const firstName = (profile.name || "").trim().split(/\s+/)[0] || "Usuário";
  const netFlow = summary.income - summary.expense;

  // Category table rows
  const categoryTableRows = useMemo(() => {
    return categoryBreakdown.map((cat) => {
      const lastMonth = lastMonthCategoryBreakdown.find((lc) => lc.id === cat.id)?.value || 0;
      return { id: cat.id, name: cat.name, color: cat.color, currentMonth: cat.value, lastMonth };
    });
  }, [categoryBreakdown, lastMonthCategoryBreakdown]);

  const totalExpense = categoryBreakdown.reduce((s, c) => s + c.value, 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader
        title="Organizador Financeiro"
        subtitle={`Olá, ${firstName}`}
        avatarId={profile.avatar_id}
        showBack
        backTo="/"
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      >
        {/* Big balance in header */}
        <div className="mt-4">
          <p className="text-primary-foreground/70 text-xs font-medium">Saldo total</p>
          <p className="text-3xl font-extrabold font-heading text-primary-foreground">
            {formatCurrency(summary.balance)}
          </p>
        </div>
      </AppHeader>

      <FinanceTopNav />

      <div className="mx-auto max-w-lg px-4 space-y-5 animate-fade-in">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 shadow-card overflow-hidden">
            <CardContent className="p-3 text-center">
              <ArrowUpCircle className="mx-auto h-4.5 w-4.5 text-success mb-1" />
              <p className="text-[10px] text-muted-foreground font-medium">Receitas</p>
              <p className="text-sm font-bold text-success">{formatCurrency(summary.income)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card overflow-hidden">
            <CardContent className="p-3 text-center">
              <ArrowDownCircle className="mx-auto h-4.5 w-4.5 text-destructive mb-1" />
              <p className="text-[10px] text-muted-foreground font-medium">Despesas</p>
              <p className="text-sm font-bold text-destructive">{formatCurrency(summary.expense)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card overflow-hidden">
            <CardContent className="p-3 text-center">
              {netFlow >= 0 ? (
                <TrendingUp className="mx-auto h-4.5 w-4.5 text-success mb-1" />
              ) : (
                <TrendingDown className="mx-auto h-4.5 w-4.5 text-destructive mb-1" />
              )}
              <p className="text-[10px] text-muted-foreground font-medium">Balanço</p>
              <p className={cn("text-sm font-bold", netFlow >= 0 ? "text-success" : "text-destructive")}>
                {netFlow >= 0 ? "+" : ""}{formatCurrency(netFlow)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Expense Distribution Bar */}
        {categoryBreakdown.length > 0 && (
          <section>
            <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Distribuição de gastos
            </h2>
            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <ExpenseDistributionBar items={categoryBreakdown} total={totalExpense} />
              </CardContent>
            </Card>
          </section>
        )}

        {/* Pie chart + Evolution side by side on desktop, stacked on mobile */}
        {(categoryBreakdown.length > 0 || monthlyEvolution.length > 1) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pie Chart */}
            {categoryBreakdown.length > 0 && (
              <section>
                <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Por categoria
                </h2>
                <Card className="border-0 shadow-card">
                  <CardContent className="p-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="50%"
                            outerRadius="80%"
                            paddingAngle={2}
                            isAnimationActive
                            animationDuration={800}
                          >
                            {categoryBreakdown.map((item, index) => (
                              <Cell key={item.id} fill={item.color || CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid hsl(var(--border))",
                              background: "hsl(var(--card))",
                              boxShadow: "var(--shadow-card)",
                              fontSize: "12px",
                              padding: "6px 10px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Monthly Evolution */}
            {monthlyEvolution.length > 1 && (
              <section>
                <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Evolução mensal
                </h2>
                <Card className="border-0 shadow-card">
                  <CardContent className="p-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyEvolution}>
                          <defs>
                            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(value: number, name: string) => [formatCurrency(value), name === "receitas" ? "Receitas" : "Despesas"]}
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid hsl(var(--border))",
                              background: "hsl(var(--card))",
                              fontSize: "12px",
                            }}
                          />
                          <Area type="monotone" dataKey="receitas" stroke="hsl(152, 55%, 48%)" fill="url(#incomeGrad)" strokeWidth={2} />
                          <Area type="monotone" dataKey="despesas" stroke="hsl(0, 72%, 55%)" fill="url(#expenseGrad)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        )}

        {/* Category Table */}
        {categoryTableRows.length > 0 && (
          <section>
            <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Gastos por categoria
            </h2>
            <CategoryTable rows={categoryTableRows} />
          </section>
        )}

        {/* Accounts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Minhas contas
            </h2>
            <button onClick={() => navigate("/financas/contas")} className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
              Ver todas <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {accounts.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                <Wallet className="mx-auto h-8 w-8 mb-2 opacity-40" />
                Nenhuma conta cadastrada ainda.<br />
                Vá em <span className="font-medium text-primary">Contas</span> para adicionar.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {accounts.slice(0, 4).map((a: any) => (
                <Card key={a.id} className="border-0 shadow-card">
                  <CardContent className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.institution || a.type}</p>
                      </div>
                    </div>
                    <p className={cn("text-sm font-bold", Number(a.current_balance) >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(Number(a.current_balance))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Recent transactions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Últimas transações
            </h2>
            <button onClick={() => navigate("/financas/transacoes")} className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
              Ver todas <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma transação este mês. Use o <span className="text-primary font-bold">+</span> para registrar!
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentTransactions.map((tx: any) => (
                <Card key={tx.id} className="border-0 shadow-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                        tx.type === "income" ? "bg-success/10" : "bg-destructive/10"
                      )}>
                        {tx.type === "income" ? (
                          <ArrowUpCircle className="h-4 w-4 text-success" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tx.source || "Sem descrição"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(tx.transaction_date).toLocaleDateString("pt-BR")}
                          {tx.categories && ` · ${tx.categories.name}`}
                        </p>
                      </div>
                    </div>
                    <p className={cn("text-sm font-bold shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <QuickTransactionFab userId={userId} />
    </div>
  );
};

export default FinanceDashboard;
