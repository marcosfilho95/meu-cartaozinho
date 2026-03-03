import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { CardSummary } from "@/components/CardSummary";
import { AddCardDialog } from "@/components/AddCardDialog";
import { AddPurchaseDialog } from "@/components/AddPurchaseDialog";
import { AccentThemeSwitch } from "@/components/AccentThemeSwitch";
import { UserAvatar } from "@/components/UserAvatar";
import { getCurrentMonth, formatCurrency } from "@/lib/installments";
import { Button } from "@/components/ui/button";
import { CreditCard, LogOut, ShoppingBag, Plus, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";

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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const [totals, setTotals] = useState<Record<string, { total: number; count: number; active: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const [{ data: cardsData }, { data: installments }, profileResult] = await Promise.all([
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId).order("created_at"),
      supabase.from("installments").select("card_id, amount, status").eq("user_id", userId).eq("ref_month", month),
      supabase.from("profiles").select("name, avatar_id").eq("user_id", userId).maybeSingle(),
    ]);

    setCards((cardsData as Card[]) || []);
    let profileData: any = profileResult.data;
    if (profileResult.error) {
      const message = String(profileResult.error.message || "");
      if (profileResult.error.code === "42703" || profileResult.error.code === "PGRST204" || message.includes("avatar_id")) {
        const fallbackProfile = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
        profileData = fallbackProfile.data ? { ...fallbackProfile.data, avatar_id: null } : null;
      }
    }
    setProfile((profileData as Profile | null) || null);

    const t: Record<string, { total: number; count: number; active: number }> = {};
    (installments || []).forEach((inst) => {
      if (!t[inst.card_id]) t[inst.card_id] = { total: 0, count: 0, active: 0 };
      t[inst.card_id].total += Number(inst.amount);
      t[inst.card_id].count += 1;
      if (inst.status === "pendente") t[inst.card_id].active += 1;
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessao encerrada");
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserAvatar avatarId={profile?.avatar_id} name={profile?.name} size={44} />
            <div>
              <p className="text-sm font-semibold text-primary-foreground/90">
                {`Olá, ${getFirstName(profile?.name)}`}
              </p>
              <h1 className="font-heading text-2xl font-bold text-primary-foreground">Minhas Faturas</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <AccentThemeSwitch
              compact
              theme={accentTheme}
              onToggle={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/perfil")}
              className="text-primary-foreground hover:bg-primary-foreground/15"
            >
              <UserCircle2 className="h-[22px] w-[22px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/compras")}
              className="text-primary-foreground hover:bg-primary-foreground/15"
            >
              <ShoppingBag className="h-[22px] w-[22px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-primary-foreground hover:bg-primary-foreground/15"
            >
              <LogOut className="h-[22px] w-[22px]" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container -mt-4 space-y-6">
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-elevated animate-fade-in">
          <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-4">
              <p className="text-sm text-muted-foreground">Total do mês</p>
              <p className="font-heading text-4xl font-extrabold text-foreground">{formatCurrency(grandTotal)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{activeInstallments} parcela(s) ativa(s) neste mês</p>
              {grandTotal === 0 && <p className="mt-2 font-semibold text-muted-foreground">Nenhuma conta para este mês</p>}
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
              {chartData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sem distribuicao no mes</div>
              ) : (
                <div className="grid items-center gap-3 lg:grid-cols-[1.2fr_1fr]">
                  <div className="h-56 rounded-xl border border-border/60 bg-card/50 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={90} paddingAngle={3}>
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
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
                    {chartData.map((item, index) => {
                      const color = BANK_CHART_COLORS[item.brand || ""] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length];
                      const pct = chartTotal > 0 ? (item.value / chartTotal) * 100 : 0;
                      return (
                        <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-[11px] text-foreground">{item.name}</span>
                          </div>
                          <p className="text-[11px] font-semibold text-muted-foreground">{pct.toFixed(1)}%</p>
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
          <AddCardDialog userId={userId} onCardAdded={fetchData} />
          {cards.length > 0 && <AddPurchaseDialog userId={userId} cards={cards} onPurchaseAdded={fetchData} />}
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
                onClick={() => navigate(`/cartao/${card.id}?mes=${month}`)}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
