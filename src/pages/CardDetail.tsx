import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { InstallmentList } from "@/components/InstallmentList";
import { BankLogo } from "@/components/BankLogo";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import {
  formatCurrency,
  getCurrentMonth,
  isInstallmentFromMonth,
  isInstallmentOpen,
} from "@/lib/installments";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { getCardDetailCache, setCardDetailCache } from "@/lib/cardDetailCache";
import { getCardBrandTheme } from "@/lib/cardBrandTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChartPie, CreditCard, Pencil, Plus, ReceiptText, ShoppingCart, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Card {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

interface Subgroup {
  name: string;
}

interface Profile {
  name: string;
  avatar_id: string | null;
}

interface CardDetailNavState {
  initialUserId?: string;
  initialCard?: Card;
  initialCards?: Card[];
  initialProfile?: Profile | null;
}

const SUBGROUP_CHART_COLORS = ["#FF3D81", "#3A86FF", "#FF9F1C", "#06D6A0", "#8338EC", "#E71D36", "#118AB2"];
const getManualSubgroupsKey = (userId: string, cardId: string) => `manual-subgroups:${userId}:${cardId}`;
const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const isMissingAvatarColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id");
};

const CardDetail: React.FC = () => {
  const { cardId } = useParams<{ cardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as CardDetailNavState;
  const [userId, setUserId] = useState<string | null>(navState.initialUserId || null);
  const [card, setCard] = useState<Card | null>(navState.initialCard || null);
  const [allCards, setAllCards] = useState<Card[]>(navState.initialCards || []);
  const requestedMonth = searchParams.get("mes");
  const [month, setMonth] = useState(requestedMonth || getCurrentMonth());
  const [installments, setInstallments] = useState<any[]>([]);
  const [manualSubgroupNames, setManualSubgroupNames] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(navState.initialProfile || null);
  const [loading, setLoading] = useState(true);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [editingSubgroupId, setEditingSubgroupId] = useState<string | null>(null);
  const [editingSubgroupName, setEditingSubgroupName] = useState("");
  const [legendVisible, setLegendVisible] = useState(false);
  const headerProfile = useUserHeaderProfile(userId);

  useEffect(() => {
    if (navState.initialUserId) {
      setUserId(navState.initialUserId);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, [navState.initialUserId]);

  useEffect(() => {
    if (!userId) return;
    const cached = getStoredProfile(userId);
    if (cached) setProfile(cached);
  }, [userId]);

  useEffect(() => {
    if (!userId || !cardId) return;
    const cached = getCardDetailCache(userId, cardId, month);
    if (cached) {
      if (cached.card) setCard(cached.card as Card);
      setAllCards((cached.allCards as Card[]) || []);
      setInstallments(cached.installments || []);
      if (cached.profile) setProfile(cached.profile as Profile);
      setLoading(false);
    }
  }, [userId, cardId, month]);

  useEffect(() => {
    if (!userId || !cardId) return;
    try {
      const raw = localStorage.getItem(getManualSubgroupsKey(userId, cardId));
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setManualSubgroupNames(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {
      setManualSubgroupNames([]);
    }
  }, [userId, cardId]);

  const fetchData = useCallback(async () => {
    if (!userId || !cardId) return;
    const hasCache = Boolean(getCardDetailCache(userId, cardId, month));
    if (!hasCache) setLoading(true);

    const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
    const profilePromise = skipAvatarColumn
      ? supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle()
      : supabase.from("profiles").select("name, avatar_id").eq("user_id", userId).maybeSingle();

    const [{ data: cardData }, { data: cardsData }, instResult, profileResult] = await Promise.all([
      supabase.from("cards").select("id, name, brand, default_due_day").eq("id", cardId).eq("user_id", userId).single(),
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId).order("created_at"),
      supabase
        .from("installments")
        .select("id, installment_number, installments_count, due_day, amount, status, ref_month, purchase_id, purchases(id, description, person)")
        .eq("card_id", cardId)
        .eq("user_id", userId)
        .eq("ref_month", month)
        .order("due_day")
        .order("installment_number"),
      profilePromise,
    ]);

    const instData = (instResult.data || []).filter((inst) => isInstallmentFromMonth(inst, month));
    const localAvatar = getStoredAvatarId(userId);
    let profileData: any = profileResult.data || null;

    if (instResult.error) {
      toast.error("Erro ao carregar fatura: " + instResult.error.message);
    }

    if (profileResult.error) {
      if (isMissingAvatarColumnError(profileResult.error)) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        const fallbackProfile = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
        profileData = fallbackProfile.data ? { ...fallbackProfile.data, avatar_id: localAvatar } : null;
      }
    }

    setCard(cardData as Card | null);
    setAllCards((cardsData as Card[]) || []);
    setInstallments(instData || []);
    const resolvedProfile = (profileData as Profile | null) || null;
    const resolvedAvatar = resolvedProfile?.avatar_id || localAvatar || null;
    if (resolvedAvatar) setStoredAvatarId(userId, resolvedAvatar);
    const mergedProfile = resolvedProfile ? { ...resolvedProfile, avatar_id: resolvedAvatar } : null;
    if (mergedProfile) setStoredProfile(userId, mergedProfile);
    setProfile(mergedProfile);
    setCardDetailCache(userId, cardId, month, {
      card: (cardData as Card | null) || null,
      allCards: (cardsData as Card[]) || [],
      installments: instData || [],
      profile: mergedProfile,
    });
    setLoading(false);
  }, [userId, cardId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeMonth = useCallback((nextMonth: string) => {
    setMonth(nextMonth);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("mes", nextMonth);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const subgroups = useMemo<Subgroup[]>(() => {
    const names = new Set<string>();
    manualSubgroupNames.forEach((name) => {
      const cleaned = name.trim();
      if (cleaned) names.add(cleaned);
    });
    installments.forEach((inst) => {
      const cleaned = String(inst.purchases?.person || "").trim();
      if (cleaned) names.add(cleaned);
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }, [installments, manualSubgroupNames]);

  const createSubgroup = async () => {
    if (!userId || !cardId) return;
    const name = newSubgroupName.trim();
    if (!name) return;
    const exists = subgroups.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast.error("Este Usuário ja existe na lista");
      return;
    }
    const next = [...manualSubgroupNames, name];
    setManualSubgroupNames(next);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(next));
    toast.success("Usuário criado");
    setNewSubgroupName("");
  };

  const saveSubgroup = async () => {
    if (!editingSubgroupId || !userId || !cardId) return;
    const oldName = editingSubgroupId;
    const newName = editingSubgroupName.trim();
    if (!newName) return;
    const { error } = await supabase
      .from("purchases")
      .update({ person: newName })
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .eq("person", oldName);
    if (error) {
      toast.error("Erro ao atualizar Usuário: " + error.message);
      return;
    }
    const nextManual = manualSubgroupNames.map((name) => (name === oldName ? newName : name));
    setManualSubgroupNames(nextManual);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(nextManual));
    toast.success("Usuário atualizado");
    setEditingSubgroupId(null);
    setEditingSubgroupName("");
    fetchData();
  };

  const deleteSubgroup = async (subgroupName: string) => {
    if (!userId || !cardId) return;
    const { error } = await supabase
      .from("purchases")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .eq("person", subgroupName);
    if (error) {
      toast.error("Erro ao excluir Usuário: " + error.message);
      return;
    }
    const nextManual = manualSubgroupNames.filter((name) => name !== subgroupName);
    setManualSubgroupNames(nextManual);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(nextManual));
    toast.success("Usuário excluido com todas as compras vinculadas");
    fetchData();
  };

  const deleteCard = async () => {
    if (!cardId || !userId) return;
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    if (error) {
      toast.error("Erro ao excluir cartao: " + error.message);
      return;
    }
    toast.success("Cartao excluido");
    navigate("/cards");
  };

  const usedSubgroupNames = useMemo(() => new Set(installments.map((inst) => inst.purchases?.person).filter(Boolean)), [installments]);
  const subgroupChartData = useMemo(() => {
    const map: Record<string, { name: string; value: number }> = {};
    installments.forEach((inst) => {
      const subgroupName = inst.purchases?.person || "Sem subgrupo";
      if (!map[subgroupName]) map[subgroupName] = { name: subgroupName, value: 0 };
      map[subgroupName].value += Number(inst.amount);
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [installments]);
  const subgroupTotal = useMemo(() => subgroupChartData.reduce((sum, item) => sum + item.value, 0), [subgroupChartData]);
  const monthStatusUI = useMemo(() => {
    const status = installments.length === 0 ? "empty" : installments.some((inst) => isInstallmentOpen(inst.status)) ? "open" : "paid";
    if (status === "paid") {
      return { label: "Pago", className: "border-success/30 bg-success/10 text-success" };
    }
    if (status === "open") {
      return { label: "Em aberto", className: "border-warning/35 bg-warning/15 text-[hsl(var(--warning-foreground))]" };
    }
    return { label: "Sem lancamentos", className: "border-border bg-secondary text-secondary-foreground" };
  }, [installments]);
  const cardTheme = useMemo(() => getCardBrandTheme(card?.brand), [card?.brand]);

  useEffect(() => {
    if (loading) {
      setLegendVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setLegendVisible(true), 90);
    return () => window.clearTimeout(timer);
  }, [month, subgroupChartData.length, loading]);

  if (!userId) return null;

  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      style={{ background: `linear-gradient(180deg, ${cardTheme.soft} 0px, hsl(var(--background)) 520px)` }}
    >
      <AppHeader
        containerClassName="max-w-6xl"
        headerClassName="pb-10"
        headerStyle={{ background: cardTheme.background }}
        title={card?.name || "Cartao"}
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        avatarUrl={headerProfile.avatarUrl}
        showBack
        backTo="/cards"
      >
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/10 px-3 py-1.5 backdrop-blur-sm">
          <CreditCard className="h-4 w-4 text-white/80" />
          <p className="text-xs font-medium text-white/80">Detalhe da fatura mensal</p>
        </div>
      </AppHeader>

      <div className="container -mt-6 flex-1 space-y-4 pb-4">
        {card ? (
        <div className="grid gap-4 animate-fade-in lg:grid-cols-[1.15fr_0.85fr]">
          <section className="relative isolate min-h-[255px] overflow-hidden rounded-[1.8rem] border border-white/20 p-5 text-white shadow-elevated sm:p-6" style={{ background: cardTheme.background }}>
            <span aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
            <span aria-hidden="true" className="absolute -bottom-32 -left-20 h-64 w-64 rounded-full border border-white/10 bg-black/10" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="relative h-11 w-16 overflow-hidden rounded-lg border border-amber-950/25 bg-gradient-to-br from-[#fff1a8] via-[#d8b955] to-[#927128] shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_2px_4px_rgba(0,0,0,0.22)]">
                    <span className="absolute inset-y-0 left-1/2 border-l border-amber-950/30" />
                    <span className="absolute inset-x-0 top-1/2 border-t border-amber-950/30" />
                    <span className="absolute left-1 top-1/2 h-6 w-5 -translate-y-1/2 rounded border border-amber-950/30" />
                    <span className="absolute right-1 top-1/2 h-6 w-5 -translate-y-1/2 rounded border border-amber-950/30" />
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/65">Meu Cartãozinho</span>
                </div>
                <span className="rounded-xl border border-white/20 bg-white/95 p-1.5 shadow-md"><BankLogo brand={card.brand} size={44} /></span>
              </div>

              <div className="mt-auto py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">Fatura de {new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                <p className="mt-1 font-heading text-3xl font-extrabold tracking-tight drop-shadow-sm sm:text-4xl">{formatCurrency(subgroupTotal)}</p>
              </div>

              <div className="flex items-end justify-between gap-4 border-t border-white/15 pt-3">
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/55">Instituição</p>
                  <p className="mt-0.5 font-heading text-lg font-bold">{card.name}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">{monthStatusUI.label}</Badge>
                  <p className="mt-1.5 text-[10px] text-white/65">{installments.length} parcela{installments.length === 1 ? "" : "s"} no mês</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="flex flex-col rounded-[1.8rem] border border-border/70 bg-card p-5 shadow-elevated">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5" style={{ color: cardTheme.accent }} />
              <div><h2 className="font-heading text-lg font-bold">Navegue pela fatura</h2><p className="text-xs text-muted-foreground">Troque o mês ou abra as compras cadastradas.</p></div>
            </div>
            <div className="mt-5"><MonthNavigator currentMonth={month} onMonthChange={changeMonth} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3" style={{ backgroundColor: cardTheme.soft }}><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Pessoas</p><p className="mt-1 font-heading text-lg font-bold">{subgroups.length}</p></div>
              <div className="rounded-xl p-3" style={{ backgroundColor: cardTheme.soft }}><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Parcelas</p><p className="mt-1 font-heading text-lg font-bold">{installments.length}</p></div>
            </div>
            <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]">
              <Button className="gap-2 text-white" style={{ backgroundColor: cardTheme.accent }} onClick={() => navigate("/compras")}>
                <ShoppingCart className="h-4 w-4" />
                Ver compras
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 sm:w-auto lg:w-full xl:w-auto">
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir cartao?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso exclui o cartao, todos os subgrupos, compras e parcelas vinculadas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteCard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir cartao
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </aside>
        </div>
        ) : (
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <section className="order-2 flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in xl:order-2" style={{ boxShadow: `inset 0 3px 0 ${cardTheme.accent}, var(--tw-shadow)` }}>
            <div className="mb-3 flex w-full items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: cardTheme.soft, color: cardTheme.accent }}><Users className="h-4 w-4" /></span>
                <div>
                <h2 className="font-heading text-lg font-bold text-foreground">Quem usou o cartão?</h2>
                <p className="text-xs text-muted-foreground">Adicione quem pediu seu cartão emprestado</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{subgroups.length} Usuário(s)</p>
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="flex-1"
                placeholder="Ex: Pai, Tio, Primo"
                value={newSubgroupName}
                onChange={(e) => setNewSubgroupName(e.target.value)}
              />
              <Button className="w-full shrink-0 gap-2 sm:w-auto" onClick={createSubgroup}>
                <Plus className="h-4 w-4" />
                Criar
              </Button>
            </div>

            {subgroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Crie grupos para organizar suas contas por pessoa.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subgroups.map((subgroup) => {
                  const inUse = usedSubgroupNames.has(subgroup.name);
                  const isEditing = editingSubgroupId === subgroup.name;

                  return (
                    <div
                      key={subgroup.name}
                      className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 transition-all hover:border-primary/45"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            value={editingSubgroupName}
                            onChange={(e) => setEditingSubgroupName(e.target.value)}
                            className="h-7 w-40"
                          />
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={saveSubgroup}>
                            Salvar
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-foreground">{subgroup.name}</span>

                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            onClick={() => {
                              setEditingSubgroupId(subgroup.name);
                              setEditingSubgroupName(subgroup.name);
                            }}
                            title="Editar subgrupo"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
                                title={`Excluir ${subgroup.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir pessoa "{subgroup.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Todas as compras e parcelas dessa pessoa neste cartao serao excluidas.
                                  {inUse ? " Existem parcelas no mes atual." : ""}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteSubgroup(subgroup.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Sim, excluir pessoa
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {subgroups.length > 0 && (
              <div className="mt-auto text-xs text-muted-foreground">
                <p className="mb-0.5 font-semibold text-foreground">Legendas</p>
                <div className="border-t border-border/60 pt-3">
                <p className="flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar nome do contato</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span>Apagar pessoa</span>
                </p>
                </div>
              </div>
            )}
          </section>

          <section className="order-1 h-full rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in xl:order-1" style={{ boxShadow: `inset 0 3px 0 ${cardTheme.accent}, var(--tw-shadow)` }}>
            <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: cardTheme.soft, color: cardTheme.accent }}><ChartPie className="h-4 w-4" /></span><h2 className="font-heading text-lg font-bold text-foreground">Divisão de gastos</h2></div>

            {subgroupChartData.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma conta para este mes.</p>
            ) : (
              <div className="mt-3 grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="h-60 rounded-xl border border-border/70 bg-background/50 p-2 sm:h-64 lg:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={subgroupChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={3}
                          isAnimationActive
                          animationBegin={40}
                          animationDuration={600}
                          animationEasing="ease-out"
                        >
                        {subgroupChartData.map((item, index) => (
                          <Cell key={item.name} fill={SUBGROUP_CHART_COLORS[index % SUBGROUP_CHART_COLORS.length]} />
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

                <div className={`space-y-2 transition-opacity duration-500 ${legendVisible ? "opacity-100" : "opacity-0"}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
                  {subgroupChartData.map((item, index) => {
                    const pct = subgroupTotal > 0 ? (item.value / subgroupTotal) * 100 : 0;
                    return (
                      <div
                        key={item.name}
                        className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: SUBGROUP_CHART_COLORS[index % SUBGROUP_CHART_COLORS.length] }}
                          />
                          <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                        </div>

                        <p className="text-xs font-semibold text-muted-foreground">{pct.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <InstallmentList
            installments={installments}
            currentMonth={month}
            userId={userId}
            cards={allCards}
            cardId={cardId}
            subgroupNames={subgroups.map((s) => s.name)}
            onUpdate={fetchData}
            onInstallmentsChange={setInstallments}
            accentColor={cardTheme.accent}
            accentSoft={cardTheme.soft}
          />
        )}
      </div>
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default CardDetail;
