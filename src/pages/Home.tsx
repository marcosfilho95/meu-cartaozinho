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
  LayoutGrid,
  BarChart3,
  Target,
  FileText,
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
    description: "Controle de cartões, faturas e parcelas",
    icon: CreditCard,
    route: "/cards",
    gradient: "from-[hsl(205,75%,58%)] to-[hsl(196,80%,74%)]",
    iconBg: "bg-blue-100 text-blue-600",
  },
  {
    id: "financas",
    title: "Organizador Financeiro",
    description: "Controle completo de finanças pessoais",
    icon: Wallet,
    route: "/financas",
    gradient: "from-emerald-500/90 to-teal-400/90",
    iconBg: "bg-emerald-100 text-emerald-600",
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

        // Card installments total
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

  return (
    <div className="min-h-screen bg-background pb-8">
      <AppHeader
        title={`${firstName} 👋`}
        subtitle={`${greeting},`}
        avatarId={profile.avatar_id}
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <div className="mx-auto max-w-lg px-4 -mt-4 space-y-5">
        {/* App Modules */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-heading text-sm font-semibold text-foreground">Meus Apps</h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {APP_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  onClick={() => navigate(mod.route)}
                  className="group relative overflow-hidden rounded-2xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className={cn("bg-gradient-to-br p-5 text-white", mod.gradient)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-heading text-base font-bold">{mod.title}</h3>
                          <p className="text-sm text-white/80 mt-0.5">{mod.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Quick Stats */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-heading text-sm font-semibold text-foreground">Visão Rápida</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">Saldo Total</span>
                </div>
                <p className={cn("text-lg font-bold font-heading", stats.totalBalance >= 0 ? "text-foreground" : "text-destructive")}>
                  {formatCurrency(stats.totalBalance)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                    <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">Cartões</span>
                </div>
                <p className="text-lg font-bold font-heading text-foreground">
                  {formatCurrency(stats.cardTotal)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
                    <ArrowUpCircle className="h-3.5 w-3.5 text-success" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">Receitas</span>
                </div>
                <p className="text-lg font-bold font-heading text-success">
                  {formatCurrency(stats.monthIncome)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10">
                    <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">Despesas</span>
                </div>
                <p className="text-lg font-bold font-heading text-destructive">
                  {formatCurrency(stats.monthExpense)}
                </p>
              </CardContent>
            </Card>
          </div>

          {(stats.pendingCount > 0) && (
            <Card className="border-0 shadow-card mt-3">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{stats.pendingCount} pendência{stats.pendingCount > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stats.pendingAmount)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Alerts */}
        {alerts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-heading text-sm font-semibold text-foreground">Alertas</h2>
            </div>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <Card
                  key={alert.id}
                  className={cn(
                    "border-0 shadow-card",
                    alert.type === "danger" && "border-l-4 border-l-destructive",
                    alert.type === "warning" && "border-l-4 border-l-warning"
                  )}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <AlertTriangle
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        alert.type === "danger" ? "text-destructive" : "text-warning"
                      )}
                    />
                    <p className="text-sm font-medium">{alert.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Future Modules */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-heading text-sm font-semibold text-foreground">Em Breve</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {FUTURE_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <Card key={mod.id} className="border-0 shadow-card opacity-50">
                  <CardContent className="flex flex-col items-center gap-1.5 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">{mod.title}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
