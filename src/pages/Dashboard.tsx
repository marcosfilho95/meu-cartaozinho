import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { CardSummary } from "@/components/CardSummary";
import { AddCardDialog } from "@/components/AddCardDialog";
import { AccentThemeSwitch } from "@/components/AccentThemeSwitch";
import { UserAvatar } from "@/components/UserAvatar";
import { AppFooter } from "@/components/AppFooter";
import { getCurrentMonth, formatCurrency, getMonthPaymentStatus, isInstallmentOpen, MonthPaymentStatus } from "@/lib/installments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, LogOut, ShoppingBag, Plus, UserCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboardCache";

interface Card {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

interface Profile {
  name: string;
  avatar_id: string | null;
}

interface MonthInstallmentStatus {
  ref_month: string | null;
  status: string | null;
}

const getFirstName = (name?: string | null) => {
  const firstName = (name || "").trim().split(/\s+/)[0];
  if (!firstName) return "Usuario";
  return firstName;
};

const BANK_CHART_COLORS: Record<string, string> = {
  nubank: "#8A05BE",
  bradesco: "#CC092F",
  bb: "#F7C400",
  c6: "#1A1A1A",
  inter: "#FF7A00",
  santander: "#EC0000",
  itau: "#EC7000",
  caixa: "#005CA8",
  picpay: "#21C25E",
  mercadopago: "#009EE3",
};
const FALLBACK_CHART_COLORS = ["#FF3D81", "#3A86FF", "#FF9F1C", "#06D6A0", "#8338EC"];
const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const isMissingAvatarColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id");
};

const inferMonthStatusFromTotals = (totals: Record<string, { total: number; count: number; active: number }>): MonthPaymentStatus => {
  const values = Object.values(totals);
  if (values.length === 0) return "empty";
  const total = values.reduce((sum, item) => sum + item.total, 0);
  if (total <= 0) return "empty";
  const active = values.reduce((sum, item) => sum + item.active, 0);
  return active > 0 ? "open" : "paid";
};

interface DashboardProps {
  initialUserId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ initialUserId }) => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(initialUserId || null);
  const [cards, setCards] = useState<Card[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const [totals, setTotals] = useState<Record<string, { total: number; count: number; active: number }>>({});
  const [loading, setLoading] = useState(true);
  const [chartVisible, setChartVisible] = useState(false);
  const [chartAnimKey, setChartAnimKey] = useState(0);
  const [chartIntroActive, setChartIntroActive] = useState(false);
  const [monthPaymentStatus, setMonthPaymentStatus] = useState<MonthPaymentStatus>("empty");
  const [overdueOpenCount, setOverdueOpenCount] = useState(0);

  useEffect(() => {
    if (initialUserId) {
      setUserId(initialUserId);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, [initialUserId]);

  useEffect(() => {
    if (!userId) return;
    const cached = getStoredProfile(userId);
    if (cached) setProfile(cached);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const cachedDashboard = getDashboardCache(userId, month);
    if (!cachedDashboard) return;
    setCards(cachedDashboard.cards);
    setTotals(cachedDashboard.totals);
    setMonthPaymentStatus(cachedDashboard.monthPaymentStatus || inferMonthStatusFromTotals(cachedDashboard.totals));
    setOverdueOpenCount(cachedDashboard.overdueOpenCount || 0);
    setLoading(false);
  }, [userId, month]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const hasVisualData = Boolean(getDashboardCache(userId, month));
    if (!hasVisualData) setLoading(true);

    const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
    const profilePromise = skipAvatarColumn
      ? supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle()
      : supabase.from("profiles").select("name, avatar_id").eq("user_id", userId).maybeSingle();

    const [{ data: cardsData }, { data: installments }, profileResult] = await Promise.all([
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId).order("created_at"),
      supabase
        .from("installments")
        .select("card_id, amount, status, ref_month")
        .eq("user_id", userId)
        .or(`ref_month.eq.${month},ref_month.lt.${month}`),
      profilePromise,
    ]);

    const rawInstallmentRows = (installments as (MonthInstallmentStatus & { card_id: string; amount: number; status: string })[]) || [];
    const installmentRows = rawInstallmentRows.filter(
      (inst) => inst.ref_month === month || (!!inst.ref_month && inst.ref_month < month && isInstallmentOpen(inst.status)),
    );
    const resolvedMonthPaymentStatus = getMonthPaymentStatus(installmentRows, month);
    const overdueCount = installmentRows.filter((inst) => !!inst.ref_month && inst.ref_month < month && isInstallmentOpen(inst.status)).length;
    setMonthPaymentStatus(resolvedMonthPaymentStatus);
    setOverdueOpenCount(overdueCount);

    setCards((cardsData as Card[]) || []);
    const localAvatar = getStoredAvatarId(userId);
    let profileData: any = profileResult.data;
    if (profileResult.error) {
      if (isMissingAvatarColumnError(profileResult.error)) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        const fallbackProfile = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
        profileData = fallbackProfile.data ? { ...fallbackProfile.data, avatar_id: localAvatar } : null;
      }
    }
    const resolvedProfile = (profileData as Profile | null) || null;
    const resolvedAvatar = resolvedProfile?.avatar_id || localAvatar || null;
    if (resolvedAvatar) setStoredAvatarId(userId, resolvedAvatar);
    const mergedProfile = resolvedProfile ? { ...resolvedProfile, avatar_id: resolvedAvatar } : null;
    if (mergedProfile) setStoredProfile(userId, mergedProfile);
    setProfile(mergedProfile);

    const t: Record<string, { total: number; count: number; active: number }> = {};
    installmentRows.forEach((inst) => {
      if (!t[inst.card_id]) t[inst.card_id] = { total: 0, count: 0, active: 0 };
      t[inst.card_id].total += Number(inst.amount);
      t[inst.card_id].count += 1;
      if (isInstallmentOpen(inst.status)) t[inst.card_id].active += 1;
    });
    setDashboardCache(userId, month, {
      cards: ((cardsData as Card[]) || []).map((card) => ({
        id: card.id,
        name: card.name,
        brand: card.brand,
        default_due_day: card.default_due_day,
      })),
      totals: t,
      monthPaymentStatus: resolvedMonthPaymentStatus,
      overdueOpenCount: overdueCount,
    });
    setTotals(t);
    setLoading(false);
  }, [userId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grandTotal = useMemo(() => Object.values(totals).reduce((sum, t) => sum + t.total, 0), [totals]);
  const activeInstallments = useMemo(() => Object.values(totals).reduce((sum, t) => sum + t.active, 0), [totals]);

  const chartData = useMemo(
    () =>
      cards
        .map((card) => ({
          id: card.id,
          name: card.name,
          brand: card.brand,
          value: totals[card.id]?.total || 0,
        }))
        .filter((item) => item.value > 0),
    [cards, totals],
  );
  const chartTotal = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);
  const monthStatusUI = useMemo(() => {
    if (loading) {
      return { label: "Carregando...", className: "border-border bg-secondary text-secondary-foreground" };
    }
    if (monthPaymentStatus === "paid") {
      return { label: "Pago", className: "border-success/30 bg-success/10 text-success" };
    }
    if (monthPaymentStatus === "open") {
      return { label: "Em aberto", className: "border-warning/35 bg-warning/15 text-[hsl(var(--warning-foreground))]" };
    }
    return { label: "Sem lancamentos", className: "border-border bg-secondary text-secondary-foreground" };
  }, [loading, monthPaymentStatus]);

  const monthHighlightMessage = useMemo(() => {
    if (loading) return null;
    if (overdueOpenCount > 0) {
      return {
        text: "Voce tem parcelas atrasadas. Evite juros e pague o quanto antes.",
        className: "border-destructive/40 bg-destructive/10 text-destructive",
      };
    }
    if (monthPaymentStatus === "open") {
      return {
        text: "Cuidado para nao atrasar as parcelas!!!",
        className: "border-warning/35 bg-warning/15 text-[hsl(var(--warning-foreground))]",
      };
    }
    if (monthPaymentStatus === "paid") {
      return {
        text: "Todas as suas contas foram pagas, muito bem! :)",
        className: "border-success/30 bg-success/10 text-success",
      };
    }
    return null;
  }, [loading, monthPaymentStatus, overdueOpenCount]);

  useEffect(() => {
    if (loading) {
      setChartVisible(false);
      setChartIntroActive(false);
      return;
    }
    setChartVisible(false);
    setChartAnimKey((prev) => prev + 1);
    setChartIntroActive(true);
    const timer = window.setTimeout(() => setChartVisible(true), 70);
    const introTimer = window.setTimeout(() => setChartIntroActive(false), 1150);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(introTimer);
    };
  }, [month, chartData.length, loading]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessao encerrada");
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar avatarId={profile?.avatar_id} name={profile?.name} size={52} />
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-tight text-primary-foreground sm:text-lg">
                {`Olá, ${getFirstName(profile?.name)}`}
              </p>
              <h1 className="truncate font-heading text-2xl font-extrabold text-primary-foreground sm:text-3xl">Minhas Faturas</h1>
            </div>
          </div>
          <div className="grid w-full grid-cols-4 items-center gap-2.5 sm:flex sm:w-auto sm:grid-cols-none">
            <div data-tour="theme-switch">
              <AccentThemeSwitch
                compact
                theme={accentTheme}
                onToggle={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/perfil")}
              className="h-12 w-full rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 sm:h-11 sm:w-11"
              aria-label="Perfil"
              title="Perfil"
              data-tour="profile-button"
            >
              <UserCircle2 className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/financas")}
              className="h-12 w-full rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 sm:h-11 sm:w-11"
              aria-label="Finanças"
              title="Organizador Financeiro"
            >
              <Wallet className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/compras")}
              className="h-12 w-full rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 sm:h-11 sm:w-11"
              aria-label="Compras"
              title="Minhas compras"
              data-tour="purchases-button"
            >
              <ShoppingBag className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-12 w-full rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 sm:h-11 sm:w-11"
              aria-label="Sair"
              title="Sair"
              data-tour="logout-button"
            >
              <LogOut className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container -mt-4 flex-1 space-y-6 pb-4">
        <section data-tour="month-summary" className="overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-elevated animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
            <Badge variant="outline" className={monthStatusUI.className}>
              {monthStatusUI.label}
            </Badge>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-4">
              <p className="text-sm text-muted-foreground">Total do mês</p>
              <p className="font-heading text-4xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{activeInstallments} parcela(s) ativa(s) neste mês</p>
              {monthHighlightMessage && (
                <p className={`mt-2 inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${monthHighlightMessage.className}`}>
                  {monthHighlightMessage.text}
                </p>
              )}
              {!loading && grandTotal === 0 && <p className="mt-2 font-semibold text-muted-foreground">Nenhuma conta para este mês</p>}
            </div>
            <div className={`rounded-2xl border border-border/70 bg-background/60 p-4 transition-all duration-500 ${chartVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
              {loading ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Carregando distribuição...</div>
              ) : chartData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sem distribuicao no mes</div>
              ) : (
                <div className="grid items-center gap-4 lg:grid-cols-[1.2fr_1.05fr]">
                  <div className="h-64 rounded-xl border border-border/60 bg-card/50 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart key={chartAnimKey}>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          className={chartIntroActive ? "chart-intro-spin" : ""}
                          innerRadius="52%"
                          outerRadius="82%"
                          paddingAngle={3}
                          isAnimationActive
                          animationBegin={120}
                          animationDuration={1550}
                          animationEasing="ease-out"
                        >
                          {chartData.map((item, index) => (
                            <Cell
                              key={item.id}
                              fill={BANK_CHART_COLORS[item.brand || ""] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{
                            borderRadius: "14px",
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                            boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
                            padding: "8px 10px",
                            fontSize: "12px",
                          }}
                          itemStyle={{ fontSize: "12px", padding: 0 }}
                          labelStyle={{ fontSize: "11px", marginBottom: "2px", color: "hsl(var(--muted-foreground))" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
                    {chartData.map((item, index) => {
                      const color = BANK_CHART_COLORS[item.brand || ""] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length];
                      const pct = chartTotal > 0 ? (item.value / chartTotal) * 100 : 0;
                      return (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-sm font-medium text-foreground whitespace-nowrap">{item.name}</span>
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">{pct.toFixed(1)}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <AddCardDialog
            userId={userId}
            onCardAdded={fetchData}
            trigger={
              <Button data-tour="new-card-button" className="gap-2 gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4" />
                Novo cartao
              </Button>
            }
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 text-center animate-fade-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <CreditCard className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Sem cartoes cadastrados</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Comece criando seu primeiro cartao para organizar as parcelas mes a mes.
            </p>
            <AddCardDialog
              userId={userId}
              onCardAdded={fetchData}
              trigger={
                <Button className="mt-4 gap-2 gradient-primary text-primary-foreground">
                  <Plus className="h-4 w-4" />
                  Cadastrar primeiro cartao
                </Button>
              }
            />
          </div>
        ) : (
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-foreground">Seus cartoes</h2>
            {cards.map((card) => (
              <CardSummary
                key={card.id}
                card={card}
                total={totals[card.id]?.total || 0}
                count={totals[card.id]?.count || 0}
                avatarId={profile?.avatar_id}
                userName={profile?.name}
                onClick={() =>
                  navigate(`/cartao/${card.id}?mes=${month}`, {
                    state: {
                      initialUserId: userId,
                      initialCard: card,
                      initialCards: cards,
                      initialProfile: profile,
                    },
                  })
                }
              />
            ))}
          </section>
        )}
      </div>
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default Dashboard;

