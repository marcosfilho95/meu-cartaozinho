import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { fetchFinanceTransactions, getCycleScopedTransactions, monthKey } from "@/lib/financeShared";
import { getDashboardSummary } from "@/lib/financeSelectors";
import { ArrowUpRight, CreditCard, TrendingUp, Wallet } from "lucide-react";

interface HomeProps {
  userId: string;
}

interface QuickStats {
  totalBalance: number;
  monthIncome: number;
  monthExpense: number;
  pendingCount: number;
  pendingAmount: number;
}

interface Alert {
  id: string;
  text: string;
  type: "warning" | "danger";
}

const APP_MODULES = [
  {
    id: "cartao",
    eyebrow: "Cartões & faturas",
    title: "Meu Cartãozinho",
    description: "Parcelas, faturas e cartões, mês a mês.",
    route: "/cards",
    icon: CreditCard,
  },
  {
    id: "financas",
    eyebrow: "Vida financeira",
    title: "Organizador",
    description: "Contas, receitas, despesas e importações.",
    route: "/financas",
    icon: Wallet,
  },
] as const;

const Home: React.FC<HomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({
    totalBalance: 0,
    monthIncome: 0,
    monthExpense: 0,
    pendingCount: 0,
    pendingAmount: 0,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const headerProfile = useUserHeaderProfile(userId);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const currentMonth = monthKey(now);
        const todayDay = now.getDate();

        const [accsRes, txsRaw] = await Promise.all([
          supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true),
          fetchFinanceTransactions(userId, 18),
        ]);

        const accs = accsRes.data || [];
        const txs = getCycleScopedTransactions(txsRaw, currentMonth, todayDay);

        const totalBalance = accs.reduce((sum, account) => {
          return sum + (account.include_in_net_worth ? Number(account.current_balance) : 0);
        }, 0);

        const monthSummary = getDashboardSummary(txs);
        const monthIncome = monthSummary.totalIncome;
        const monthExpense = monthSummary.totalExpense;
        const pendingTxs = txs.filter((tx: any) => tx.status === "pending" || tx.status === "overdue");
        const pendingCount = pendingTxs.length;
        const pendingAmount = pendingTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);

        setStats({ totalBalance, monthIncome, monthExpense, pendingCount, pendingAmount });

        const today = now.toISOString().slice(0, 10);
        const threeDaysLater = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

        const overdue = txs.filter(
          (tx: any) => tx.status === "overdue" || (tx.status === "pending" && tx.due_date && tx.due_date < today),
        );
        const dueSoon = txs.filter(
          (tx: any) => tx.status === "pending" && tx.due_date && tx.due_date >= today && tx.due_date <= threeDaysLater,
        );

        const builtAlerts: Alert[] = [];
        if (overdue.length > 0) {
          builtAlerts.push({
            id: "overdue",
            text: `${overdue.length} conta${overdue.length > 1 ? "s" : ""} atrasada${overdue.length > 1 ? "s" : ""}`,
            type: "danger",
          });
        }
        if (dueSoon.length > 0) {
          builtAlerts.push({
            id: "due-soon",
            text: `${dueSoon.length} conta${dueSoon.length > 1 ? "s" : ""} vence nos próximos 3 dias`,
            type: "warning",
          });
        }

        setAlerts(builtAlerts);
      } catch (error) {
        console.error("Home load error", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  const netFlow = stats.monthIncome - stats.monthExpense;
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthLabelCapped = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="min-h-screen bg-background pb-16">
      <AppHeader
        title="Meu Cartãozinho"
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <main className="mx-auto max-w-5xl px-4 pt-6 animate-fade-in sm:px-6">
        {/* Editorial hero */}
        <header className="mb-8 flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            {monthLabelCapped}
          </p>
          <h1 className="font-heading text-3xl font-normal leading-[1.05] tracking-tight text-foreground sm:text-4xl">
            Sua vida financeira,
            <br />
            <span className="italic text-primary">em ordem</span>.
          </h1>
        </header>

        {/* Bento */}
        <div className="grid grid-cols-6 gap-3 sm:gap-4">
          {/* Patrimônio — hero tile */}
          <div className="col-span-6 rounded-2xl border border-border/70 bg-card p-6 shadow-card md:col-span-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Patrimônio líquido
            </p>
            <p
              className={cn(
                "mt-3 font-heading text-4xl font-normal tracking-tight tabular-nums text-foreground sm:text-5xl",
                loading && "opacity-40",
              )}
            >
              {formatCurrency(stats.totalBalance)}
            </p>
            <div className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4 text-xs">
              <TrendingUp className={cn("h-3.5 w-3.5", netFlow >= 0 ? "text-success" : "text-destructive")} />
              <span className="font-medium text-muted-foreground">Saldo do mês</span>
              <span
                className={cn(
                  "ml-auto font-semibold tabular-nums",
                  netFlow >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {netFlow >= 0 ? "+" : ""}
                {formatCurrency(netFlow)}
              </span>
            </div>
          </div>

          {/* Pendências */}
          <button
            onClick={() => navigate("/financas/previstas")}
            className="col-span-6 rounded-2xl border border-border/70 bg-card p-6 text-left shadow-card transition hover:border-primary/30 hover:shadow-elevated md:col-span-2"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Pendências
            </p>
            <p className="mt-3 font-heading text-4xl font-normal tabular-nums text-foreground">
              {stats.pendingCount}
            </p>
            {stats.pendingCount > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {formatCurrency(stats.pendingAmount)} a vencer
              </p>
            ) : (
              <p className="mt-2 text-xs text-success">Tudo em dia.</p>
            )}
          </button>

          {/* Módulos */}
          {APP_MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => navigate(module.route)}
                className="group col-span-6 overflow-hidden rounded-2xl border border-border/70 bg-card p-6 text-left shadow-card transition-all duration-300 hover:border-primary/40 hover:shadow-elevated md:col-span-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {module.eyebrow}
                </p>
                <h3 className="mt-1 font-heading text-2xl font-normal leading-tight text-foreground">
                  {module.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {module.description}
                </p>
              </button>
            );
          })}

          {/* Receitas / Despesas */}
          <div className="col-span-3 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Receitas do mês
            </p>
            <p className="mt-2 font-heading text-2xl font-normal tabular-nums text-success sm:text-3xl">
              {formatCurrency(stats.monthIncome)}
            </p>
          </div>
          <div className="col-span-3 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Despesas do mês
            </p>
            <p className="mt-2 font-heading text-2xl font-normal tabular-nums text-destructive sm:text-3xl">
              {formatCurrency(stats.monthExpense)}
            </p>
          </div>

          {/* Alertas */}
          {alerts.length > 0 && (
            <div className="col-span-6 space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                    alert.type === "danger" && "border-destructive/25 bg-destructive/5 text-destructive",
                    alert.type === "warning" &&
                      "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning-foreground))]",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="font-medium">{alert.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-10 text-center font-heading text-xs italic text-muted-foreground">
          Menos é mais.
        </p>
      </main>
    </div>
  );
};

export default Home;