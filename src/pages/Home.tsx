import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  ChevronRight,
  Clock,
  TrendingUp,
  Target,
  FileText,
  BarChart3,
} from "lucide-react";
import { getStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile } from "@/lib/profileCache";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";

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
    id: "cartaozinho",
    title: "Meu Cartãozinho",
    description: "Cartões, faturas e parcelas",
    icon: CreditCard,
    route: "/cards",
    gradient: "gradient-primary",
  },
  {
    id: "financas",
    title: "Organizador Financeiro",
    description: "Finanças pessoais completas",
    icon: Wallet,
    route: "/financas",
    gradient: "from-[hsl(152,55%,42%)] to-[hsl(168,60%,48%)]",
  },
];

const FUTURE_MODULES = [
  { id: "metas", title: "Metas", icon: Target },
  { id: "relatorios", title: "Relatórios", icon: FileText },
  { id: "investimentos", title: "Investimentos", icon: BarChart3 },
];

const Home: React.FC<HomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({
    totalBalance: 0, monthIncome: 0, monthExpense: 0,
    pendingCount: 0, pendingAmount: 0, cardTotal: 0,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [profile, setProfile] = useState<{ name: string; avatar_id: string | null }>({
    name: "", avatar_id: null,
  });
  const [loading, setLoading] = useState(true);
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
      try {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
        const currentRefMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const [profileRes, accsRes, txRes, installRes] = await Promise.all([
          supabase.from("profiles").select("name, avatar_id").eq("user_id", userId).maybeSingle(),
          supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true),
          supabase.from("transactions").select("*").eq("user_id", userId).is("deleted_at", null)
            .gte("transaction_date", monthStart).lt("transaction_date", monthEnd),
          supabase.from("installments").select("amount, status, ref_month").eq("user_id", userId)
            .eq("ref_month", currentRefMonth),
        ]);

        if (profileRes.data) {
          setProfile({ name: profileRes.data.name || "", avatar_id: profileRes.data.avatar_id });
        }

        const accs = accsRes.data || [];
        const txs = txRes.data || [];
        const installs = installRes.data || [];

        const totalBalance = accs.reduce(
          (s, a) => s + (a.include_in_net_worth ? Number(a.current_balance) : 0), 0
        );
        const monthIncome = txs
          .filter((t: any) => t.type === "income" && t.status !== "canceled")
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const monthExpense = txs
          .filter((t: any) => t.type === "expense" && t.status !== "canceled")
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const pendingTxs = txs.filter((t: any) => t.status === "pending");
        const pendingCount = pendingTxs.length;
        const pendingAmount = pendingTxs.reduce((s: number, t: any) => s + Number(t.amount), 0);
        const cardTotal = installs.reduce((s: number, i: any) => s + Number(i.amount), 0);

        setStats({ totalBalance, monthIncome, monthExpense, pendingCount, pendingAmount, cardTotal });

        // Build alerts
        const newAlerts: Alert[] = [];
        const today = now.toISOString().slice(0, 10);
        const threeDaysLater = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

        const overdue = txs.filter(
          (t: any) => t.status === "overdue" || (t.status === "pending" && t.due_date && t.due_date < today)
        );
        if (overdue.length > 0) {
          newAlerts.push({
            id: "overdue",
            text: `${overdue.length} conta${overdue.length > 1 ? "s" : ""} atrasada${overdue.length > 1 ? "s" : ""}`,
            type: "danger",
          });
        }

        const openInstalls = installs.filter((i: any) => i.status === "pendente");
        if (openInstalls.length > 0) {
          newAlerts.push({
            id: "card-pending",
            text: `${openInstalls.length} parcela${openInstalls.length > 1 ? "s" : ""} de cartão em aberto`,
            type: "warning",
          });
        }

        const dueSoon = txs.filter(
          (t: any) => t.status === "pending" && t.due_date && t.due_date >= today && t.due_date <= threeDaysLater
        );
        if (dueSoon.length > 0) {
          newAlerts.push({
            id: "due-soon",
            text: `${dueSoon.length} conta${dueSoon.length > 1 ? "s" : ""} vence${dueSoon.length > 1 ? "m" : ""} nos próximos 3 dias`,
            type: "warning",
          });
        }

        setAlerts(newAlerts);
      } catch (err) {
        console.error("Home load error", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const firstName = (profile.name || "").trim().split(/\s+/)[0] || "Usuário";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const netFlow = stats.monthIncome - stats.monthExpense;

  return (
    <div className="min-h-screen bg-background pb-8">
      <AppHeader
        title={`${firstName} 👋`}
        subtitle={greeting}
        avatarId={profile.avatar_id}
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <div className="mx-auto max-w-lg px-4 -mt-4 space-y-5 animate-fade-in">
        {/* App Modules */}
        <section className="space-y-3">
          {APP_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => navigate(mod.route)}
                className="group relative w-full overflow-hidden rounded-2xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className={cn("p-5 text-white shadow-elevated", mod.gradient === "gradient-primary" ? "gradient-primary" : `bg-gradient-to-br ${mod.gradient}`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-heading text-base font-bold">{mod.title}</h3>
                        <p className="text-sm text-white/75 mt-0.5">{mod.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        {/* Quick Stats — refined 2x2 grid */}
        <section>
          <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Visão do mês
          </h2>

          {/* Main balance card */}
          <Card className="border-0 shadow-elevated mb-3 overflow-hidden">
            <CardContent className="p-0">
              <div className="gradient-primary px-5 py-4">
                <p className="text-primary-foreground/70 text-xs font-medium">Patrimônio</p>
                <p className={cn("text-2xl font-extrabold font-heading text-primary-foreground")}>
                  {formatCurrency(stats.totalBalance)}
                </p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/40">
                <div className="px-3 py-3 text-center">
                  <ArrowUpCircle className="mx-auto h-4 w-4 text-success mb-1" />
                  <p className="text-[10px] text-muted-foreground">Receitas</p>
                  <p className="text-xs font-bold text-success">{formatCurrency(stats.monthIncome)}</p>
                </div>
                <div className="px-3 py-3 text-center">
                  <ArrowDownCircle className="mx-auto h-4 w-4 text-destructive mb-1" />
                  <p className="text-[10px] text-muted-foreground">Despesas</p>
                  <p className="text-xs font-bold text-destructive">{formatCurrency(stats.monthExpense)}</p>
                </div>
                <div className="px-3 py-3 text-center">
                  <CreditCard className="mx-auto h-4 w-4 text-primary mb-1" />
                  <p className="text-[10px] text-muted-foreground">Cartões</p>
                  <p className="text-xs font-bold text-foreground">{formatCurrency(stats.cardTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net flow + pending */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-card">
              <CardContent className="p-3.5">
                <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Balanço do mês</p>
                <p className={cn("text-lg font-bold font-heading", netFlow >= 0 ? "text-success" : "text-destructive")}>
                  {netFlow >= 0 ? "+" : ""}{formatCurrency(netFlow)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-card">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Clock className="h-3 w-3 text-warning" />
                  <p className="text-[10px] text-muted-foreground font-medium">Pendências</p>
                </div>
                <p className="text-lg font-bold font-heading text-foreground">
                  {stats.pendingCount}
                </p>
                {stats.pendingCount > 0 && (
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(stats.pendingAmount)}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Alerts */}
        {alerts.length > 0 && (
          <section>
            <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Alertas
            </h2>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3",
                    alert.type === "danger" && "bg-destructive/8 border border-destructive/20",
                    alert.type === "warning" && "bg-warning/8 border border-warning/20"
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      alert.type === "danger" ? "text-destructive" : "text-warning"
                    )}
                  />
                  <p className="text-sm font-medium text-foreground">{alert.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Future Modules */}
        <section>
          <h2 className="font-heading text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Em breve
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {FUTURE_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div key={mod.id} className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 opacity-50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">{mod.title}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
