import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CreditCard, Layers3, Plus, ShoppingCart, WalletCards } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AddCardDialog } from "@/components/AddCardDialog";
import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { BankLogo } from "@/components/BankLogo";
import { MonthNavigator } from "@/components/MonthNavigator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboardCache";
import {
  addMonths,
  formatCurrency,
  getCurrentMonth,
  getCycleMonthForDueDay,
  isInstallmentOpen,
  isRefMonthInCycleOrCarry,
} from "@/lib/installments";
import { cn } from "@/lib/utils";

interface CardItem {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

type CardTotal = { total: number; count: number; active: number };

const BANK_CHART_COLORS: Record<string, string> = {
  nubank: "#8A05BE",
  amazonprime: "#FF6500",
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

const FALLBACK_CHART_COLORS = ["#0F766E", "#2563EB", "#D97706", "#DB2777", "#7C3AED"];

const BANK_CARD_BACKGROUNDS: Record<string, string> = {
  nubank: "linear-gradient(135deg, #8a05be 0%, #5b0878 52%, #260532 100%)",
  amazonprime: "linear-gradient(135deg, #ff7a00 0%, #b94700 52%, #27150a 100%)",
  bradesco: "linear-gradient(135deg, #d4153d 0%, #8d0928 52%, #300814 100%)",
  bb: "linear-gradient(135deg, #172b67 0%, #0d1a43 58%, #07102d 100%)",
  c6: "linear-gradient(135deg, #303030 0%, #111827 55%, #020617 100%)",
  inter: "linear-gradient(135deg, #ff7a00 0%, #ad4300 54%, #321500 100%)",
  santander: "linear-gradient(135deg, #ec1c24 0%, #9d0b18 54%, #32070b 100%)",
  itau: "linear-gradient(135deg, #ec7000 0%, #7c2d12 52%, #1e1b4b 100%)",
  caixa: "linear-gradient(135deg, #0875b9 0%, #07527e 55%, #06263d 100%)",
  picpay: "linear-gradient(135deg, #21c25e 0%, #08783a 52%, #03321d 100%)",
  mercadopago: "linear-gradient(135deg, #009ee3 0%, #086b9e 52%, #062d46 100%)",
};

const FALLBACK_CARD_BACKGROUNDS = [
  "linear-gradient(135deg, #0f766e 0%, #064e3b 55%, #022c22 100%)",
  "linear-gradient(135deg, #2563eb 0%, #1e3a8a 55%, #172554 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #4c1d95 55%, #2e1065 100%)",
];

const formatCardMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
};

interface DashboardProps {
  initialUserId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ initialUserId }) => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(initialUserId || null);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [totals, setTotals] = useState<Record<string, CardTotal>>({});
  const [loading, setLoading] = useState(true);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const headerProfile = useUserHeaderProfile(userId);

  useEffect(() => () => {
    if (navigationTimerRef.current !== null) window.clearTimeout(navigationTimerRef.current);
  }, []);

  const openCard = (card: CardItem) => {
    if (openingCardId) return;

    setOpeningCardId(card.id);
    const targetMonth = getCycleMonthForDueDay({
      baseMonth: month,
      dueDay: card.default_due_day,
      onlyShiftCurrentMonth: true,
    });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    navigationTimerRef.current = window.setTimeout(() => {
      navigate(`/cartao/${card.id}?mes=${targetMonth}`, {
        state: { initialUserId: userId, initialCard: card, initialCards: cards },
      });
    }, reduceMotion ? 0 : 180);
  };

  useEffect(() => {
    if (initialUserId) {
      setUserId(initialUserId);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id || null));
  }, [initialUserId]);

  useEffect(() => {
    if (!userId) return;
    const cached = getDashboardCache(userId, month);
    if (!cached) return;
    setCards(cached.cards);
    setTotals(cached.totals);
    setLoading(false);
  }, [month, userId]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    if (!getDashboardCache(userId, month)) setLoading(true);

    const nextMonth = addMonths(month, 1);
    const [{ data: cardsData, error: cardsError }, { data: installments, error: installmentsError }] = await Promise.all([
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId).order("created_at"),
      supabase
        .from("installments")
        .select("card_id, amount, status, ref_month")
        .eq("user_id", userId)
        .lte("ref_month", nextMonth),
    ]);

    if (cardsError || installmentsError) {
      console.error("Card dashboard load error", cardsError || installmentsError);
      setLoading(false);
      return;
    }

    const resolvedCards = (cardsData || []) as CardItem[];
    const cycleMonthByCardId = new Map<string, string>();
    resolvedCards.forEach((card) => {
      cycleMonthByCardId.set(card.id, getCycleMonthForDueDay({
        baseMonth: month,
        dueDay: card.default_due_day,
        onlyShiftCurrentMonth: true,
      }));
    });

    const scopedInstallments = (installments || []).filter((installment) => {
      const cycleMonth = cycleMonthByCardId.get(installment.card_id) || month;
      return isRefMonthInCycleOrCarry(installment.ref_month, cycleMonth, installment.status);
    });

    const nextTotals: Record<string, CardTotal> = {};
    scopedInstallments.forEach((installment) => {
      if (!nextTotals[installment.card_id]) nextTotals[installment.card_id] = { total: 0, count: 0, active: 0 };
      nextTotals[installment.card_id].total += Number(installment.amount || 0);
      nextTotals[installment.card_id].count += 1;
      if (isInstallmentOpen(installment.status)) nextTotals[installment.card_id].active += 1;
    });

    setCards(resolvedCards);
    setTotals(nextTotals);
    setDashboardCache(userId, month, { cards: resolvedCards, totals: nextTotals });
    setLoading(false);
  }, [month, userId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const chartData = useMemo(() => cards
    .map((card, index) => ({
      ...card,
      value: totals[card.id]?.total || 0,
      count: totals[card.id]?.count || 0,
      color: BANK_CHART_COLORS[card.brand || ""] || FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length],
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value), [cards, totals]);

  const grandTotal = chartData.reduce((sum, item) => sum + item.value, 0);
  const totalInstallments = chartData.reduce((sum, item) => sum + item.count, 0);
  const averagePerCard = chartData.length ? grandTotal / chartData.length : 0;
  const leadingCard = chartData[0] || null;
  const leadingShare = leadingCard && grandTotal > 0 ? (leadingCard.value / grandTotal) * 100 : 0;

  if (!userId) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        containerClassName="max-w-6xl"
        title="Meu Cartãozinho"
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        avatarUrl={headerProfile.avatarUrl}
        showBack
        backTo="/"
      />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 pb-8 pt-6 sm:px-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Cartões e valores a receber</p>
            <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">Uma visão clara de cada cartão.</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Veja o total do mês, a participação de cada cartão e abra os detalhes quando precisar.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
            <AddCardDialog
              userId={userId}
              onCardAdded={fetchData}
              trigger={<Button className="gap-2"><Plus className="h-4 w-4" /> Novo cartão</Button>}
            />
            <Button variant="outline" className="gap-2" onClick={() => navigate("/compras")}>
              <ShoppingCart className="h-4 w-4" /> Compras
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <Skeleton className="h-72 rounded-3xl" />
            <Skeleton className="h-72 rounded-3xl" />
          </div>
        ) : chartData.length === 0 ? (
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-elevated">
            <CardContent className="flex min-h-64 flex-col items-start justify-center p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CreditCard className="h-6 w-6" /></div>
              <h2 className="mt-5 font-heading text-2xl font-bold">Nenhum valor neste mês</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">Cadastre cartões — incluindo Amazon Prime — e registre as compras para acompanhar os totais mensais.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <AddCardDialog userId={userId} onCardAdded={fetchData} trigger={<Button><Plus className="mr-2 h-4 w-4" /> Cadastrar cartão</Button>} />
                <Button variant="outline" onClick={() => navigate("/compras")}>Ver compras</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <Card className="overflow-hidden border-0 bg-primary text-primary-foreground shadow-elevated">
              <CardContent className="flex h-full min-h-72 flex-col p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">Total do mês</p>
                  <WalletCards className="h-5 w-5 text-primary-foreground/65" />
                </div>
                <p className="mt-5 font-heading text-4xl font-bold tracking-tight sm:text-5xl">{formatCurrency(grandTotal)}</p>
                <p className="mt-2 text-sm text-primary-foreground/70">{totalInstallments} {totalInstallments === 1 ? "parcela" : "parcelas"} em {chartData.length} {chartData.length === 1 ? "cartão" : "cartões"}</p>
                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-primary-foreground/15 pt-5">
                  <div><p className="text-[10px] uppercase tracking-wide text-primary-foreground/55">Média por cartão</p><p className="mt-1 font-semibold">{formatCurrency(averagePerCard)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-primary-foreground/55">Maior participação</p><p className="mt-1 truncate font-semibold">{leadingCard?.name} · {leadingShare.toFixed(0)}%</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-card">
              <CardContent className="p-5 sm:p-6">
                <div><h2 className="font-heading text-lg font-bold">Distribuição por cartão</h2><p className="mt-1 text-xs text-muted-foreground">Quanto cada cartão representa no total do mês.</p></div>
                <div className="mt-3 grid items-center gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                  <div className="relative h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="84%" paddingAngle={3} strokeWidth={0}>
                          {chartData.map((item) => <Cell key={item.id} fill={item.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span><strong className="mt-1 text-sm">{formatCurrency(grandTotal)}</strong></div>
                  </div>
                  <div className="space-y-2">
                    {chartData.map((item) => {
                      const percentage = grandTotal > 0 ? (item.value / grandTotal) * 100 : 0;
                      return (
                        <div key={item.id} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 font-medium"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{item.name}</span></span><strong>{formatCurrency(item.value)}</strong></div>
                          <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: item.color }} /></div><span className="w-10 text-right text-[10px] font-semibold text-muted-foreground">{percentage.toFixed(0)}%</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && cards.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3"><div><h2 className="font-heading text-xl font-bold">Seus cartões</h2><p className="text-xs text-muted-foreground">Abra um cartão para ver pessoas, parcelas e compras.</p></div><span className="text-xs text-muted-foreground">{cards.length} cadastrados</span></div>
            <div className="grid gap-4 md:grid-cols-2">
              {cards.map((card, index) => {
                const total = totals[card.id]?.total || 0;
                const count = totals[card.id]?.count || 0;
                const percentage = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                const cardBackground = BANK_CARD_BACKGROUNDS[card.brand || ""] || FALLBACK_CARD_BACKGROUNDS[index % FALLBACK_CARD_BACKGROUNDS.length];
                const isOpening = openingCardId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => openCard(card)}
                    aria-label={`Abrir o cartão ${card.name}`}
                    aria-busy={isOpening}
                    style={{ background: cardBackground }}
                    className={cn(
                      "group relative isolate flex aspect-[1.72/1] min-h-[220px] touch-manipulation overflow-hidden rounded-[1.7rem] border border-white/20 p-5 text-left text-white shadow-[0_18px_38px_-18px_rgba(15,23,42,0.75)] outline-none transition-all duration-300 ease-out hover:z-10 hover:-translate-y-2 hover:rotate-[-0.35deg] hover:scale-[1.015] hover:shadow-[0_30px_55px_-20px_rgba(15,23,42,0.85)] focus-visible:z-10 focus-visible:-translate-y-1 focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none sm:min-h-0 sm:p-6",
                      isOpening && "z-20 -translate-y-3 scale-[1.025] ring-4 ring-primary/25 shadow-[0_28px_52px_-16px_rgba(2,44,34,0.95)]",
                    )}
                  >
                    <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(115deg,transparent_20%,rgba(255,255,255,0.10)_46%,transparent_70%)] opacity-0 transition-all duration-700 group-hover:translate-x-1/3 group-hover:opacity-100" />
                    <span aria-hidden="true" className="absolute -right-16 -top-20 h-60 w-60 rounded-full border border-white/10 bg-white/5" />
                    <span aria-hidden="true" className="absolute -bottom-28 -left-20 h-56 w-56 rounded-full border border-white/10 bg-black/10" />

                    <div className="relative z-10 flex w-full flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className="relative h-10 w-14 overflow-hidden rounded-lg border border-amber-950/25 bg-gradient-to-br from-[#fff1a8] via-[#d8b955] to-[#927128] shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_2px_4px_rgba(0,0,0,0.22)]">
                            <span className="absolute inset-y-0 left-1/2 border-l border-amber-950/30" />
                            <span className="absolute inset-x-0 top-1/2 border-t border-amber-950/30" />
                            <span className="absolute left-1 top-1/2 h-5 w-4 -translate-y-1/2 rounded border border-amber-950/30" />
                            <span className="absolute right-1 top-1/2 h-5 w-4 -translate-y-1/2 rounded border border-amber-950/30" />
                          </span>
                          <span className="hidden text-[9px] font-semibold uppercase tracking-[0.22em] text-white/65 min-[390px]:inline">Meu Cartãozinho</span>
                        </div>
                        <span className="rounded-xl border border-white/20 bg-white/95 p-1.5 shadow-md">
                          <BankLogo brand={card.brand} size={42} />
                        </span>
                      </div>

                      <div className="mt-auto pb-4 pt-4 sm:pb-5">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/65">Fatura de {formatCardMonth(month)}</p>
                        <p className={cn("mt-1 font-heading text-[1.65rem] font-bold tracking-tight drop-shadow-sm sm:text-3xl", total > 0 ? "text-white" : "text-white/60")}>{formatCurrency(total)}</p>
                      </div>

                      <div className="flex items-end justify-between gap-4 border-t border-white/15 pt-3">
                        <div className="min-w-0">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/55">Instituição</p>
                          <h3 className="mt-0.5 truncate font-heading text-base font-bold text-white sm:text-lg">{card.name}</h3>
                          <p className="mt-0.5 text-[11px] text-white/65">{count > 0 ? `${count} ${count === 1 ? "parcela" : "parcelas"} no mês` : "Sem valores no mês"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1 text-[10px] font-bold text-white/85">{percentage.toFixed(0)}%</span>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white group-hover:text-slate-950">
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <AddCardDialog
                userId={userId}
                onCardAdded={fetchData}
                trigger={<button type="button" className="group flex aspect-[1.72/1] min-h-[220px] touch-manipulation flex-col items-center justify-center rounded-[1.7rem] border border-dashed border-border bg-muted/15 p-5 text-center outline-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/5 hover:shadow-card focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-[0.985] motion-reduce:transform-none sm:min-h-0"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110"><Plus className="h-5 w-5" /></div><p className="mt-3 text-sm font-semibold">Adicionar outro cartão</p><p className="mt-1 text-xs text-muted-foreground">Nubank, Amazon Prime, Mercado Pago e outros</p></button>}
              />
            </div>
          </section>
        )}

        <Card className="border-border/60 bg-muted/20 shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 className="h-4 w-4" /></div><div><p className="text-sm font-semibold">Visão mensal, sem complicação</p><p className="text-xs text-muted-foreground">Os totais daqui entram automaticamente como receita prevista no Organizador.</p></div></div><Button variant="ghost" size="sm" onClick={() => navigate("/financas")}>Ver Organizador <ArrowRight className="ml-1 h-4 w-4" /></Button></CardContent></Card>
      </main>
      <AppFooter plain className="pb-1 pt-0" />
    </div>
  );
};

export default Dashboard;
