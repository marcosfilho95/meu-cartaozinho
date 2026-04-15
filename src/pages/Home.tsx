import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronRight,
  Clock3,
  CreditCard,
  Sparkles,
  Wallet,
} from "lucide-react";

interface HomeProps {
  userId: string;
}

interface QuickStats {
  totalBalance: number;
  monthIncome: number;
  monthExpense: number;
  pendingCount: number;
  pendingAmount: number;
  cardTotal: number;
}

interface Alert {
  id: string;
  text: string;
  type: "warning" | "danger";
}

const APP_MODULES = [
  {
    id: "Cartãozinho",
    title: "Meu Cartãozinho",
    description: "Cartões, faturas e parcelas",
    route: "/cards",
    icon: CreditCard,
    badge: "Controle de cartões",
  },
  {
    id: "financas",
    title: "Organizador Financeiro",
    description: "Receitas, despesas e contas",
    route: "/financas",
    icon: Wallet,
    badge: "Planejamento mensal",
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
    cardTotal: 0,
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
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
        const currentRefMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const [accsRes, txRes, installRes] = await Promise.all([
          supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true),
          supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .is("deleted_at", null)
            .gte("transaction_date", monthStart)
            .lt("transaction_date", monthEnd),
          supabase.from("installments").select("amount, status, ref_month").eq("user_id", userId).eq("ref_month", currentRefMonth),
        ]);

        const accs = accsRes.data || [];
        const txs = txRes.data || [];
        const installs = installRes.data || [];

        const totalBalance = accs.reduce((sum, account) => {
          return sum + (account.include_in_net_worth ? Number(account.current_balance) : 0);
        }, 0);

        const monthIncome = txs
          .filter((tx: any) => tx.type === "income" && tx.status !== "canceled")
          .reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);

        const monthExpense = txs
          .filter((tx: any) => tx.type === "expense" && tx.status !== "canceled")
          .reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);

        const pendingTxs = txs.filter((tx: any) => tx.status === "pending");
        const pendingCount = pendingTxs.length;
        const pendingAmount = pendingTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
        const cardTotal = installs.reduce((sum: number, item: any) => sum + Number(item.amount), 0);

        setStats({ totalBalance, monthIncome, monthExpense, pendingCount, pendingAmount, cardTotal });

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const netFlow = stats.monthIncome - stats.monthExpense;

  return (
    <div className="min-h-screen bg-background pb-10">
      <AppHeader
        title="Home"
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <div className="mx-auto -mt-3 max-w-2xl space-y-5 px-4 pb-2 animate-fade-in">
        <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-elevated">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Resumo rápido</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="font-heading text-3xl font-extrabold text-foreground">{formatCurrency(stats.totalBalance)}</p>
            </div>
            <div className="rounded-2xl bg-secondary/70 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saldo do mês</p>
              <p className={cn("text-sm font-bold", netFlow >= 0 ? "text-success" : "text-destructive")}>
                {netFlow >= 0 ? "+" : ""}
                {formatCurrency(netFlow)}
              </p>
            </div>
          </div>
          
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-bold text-foreground">Meus apps</h2>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>

          <div className="space-y-3">
            {APP_MODULES.map((module) => {
              const Icon = module.icon;
              const isCardApp = module.id === "Cartãozinho";

              return (
                <button
                  key={module.id}
                  onClick={() => navigate(module.route)}
                  className="group w-full text-left"
                >
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-3xl p-4 text-white shadow-elevated transition-all duration-200 group-hover:scale-[1.015] group-active:scale-[0.985]",
                      isCardApp
                        ? cn(
                            "gradient-primary",
                            accentTheme === "blue" ? "ring-1 ring-cyan-200/60" : "ring-1 ring-pink-200/60",
                          )
                        : "bg-gradient-to-br from-[hsl(152,55%,42%)] to-[hsl(168,60%,48%)]",
                    )}
                  >
                    <div className="absolute right-[-22px] top-[-20px] h-24 w-24 rounded-full bg-white/15 blur-md" />
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 backdrop-blur-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">{module.badge}</p>
                          <h3 className="font-heading text-lg font-extrabold leading-tight">{module.title}</h3>
                          
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                        Abrir
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-sm font-bold text-foreground">Visão rápida</h2>

          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-card">
              <CardContent className="p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total em cartões</p>
                <p className="mt-1 text-base font-extrabold text-foreground">{formatCurrency(stats.cardTotal)}</p>
                <p className="text-[10px] text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card">
              <CardContent className="p-3.5">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-warning" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pendências</p>
                </div>
                <p className="text-base font-extrabold text-foreground">{stats.pendingCount}</p>
                {stats.pendingCount > 0 && <p className="text-[11px] text-muted-foreground">{formatCurrency(stats.pendingAmount)}</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Card className="border-0 shadow-card">
              <CardContent className="p-3 text-center">
                <ArrowUpCircle className="mx-auto h-4 w-4 text-success" />
                <p className="mt-1 text-[10px] text-muted-foreground">Receitas</p>
                <p className="text-xs font-bold text-success">{formatCurrency(stats.monthIncome)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card">
              <CardContent className="p-3 text-center">
                <ArrowDownCircle className="mx-auto h-4 w-4 text-destructive" />
                <p className="mt-1 text-[10px] text-muted-foreground">Despesas</p>
                <p className="text-xs font-bold text-destructive">{formatCurrency(stats.monthExpense)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card">
              <CardContent className="p-3 text-center">
                <Wallet className={cn("mx-auto h-4 w-4", netFlow >= 0 ? "text-success" : "text-destructive")} />
                <p className="mt-1 text-[10px] text-muted-foreground">Saldo mês</p>
                <p className={cn("text-xs font-bold", netFlow >= 0 ? "text-success" : "text-destructive")}>
                  {formatCurrency(netFlow)}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {alerts.length > 0 && (
          <section className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-medium",
                  alert.type === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
                  alert.type === "warning" && "border-warning/35 bg-warning/15 text-[hsl(var(--warning-foreground))]",
                )}
              >
                {alert.text}
              </div>
            ))}
          </section>
        )}

        <section className="rounded-2xl border border-dashed border-border/70 bg-muted/25 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Em breve</p>
          <p className="mt-1 text-sm text-muted-foreground">Metas, relatórios e investimentos no mesmo hub.</p>
        </section>
      </div>
    </div>
  );
};

export default Home;

