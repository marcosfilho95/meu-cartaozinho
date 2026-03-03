import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { InstallmentList } from "@/components/InstallmentList";
import { BankLogo } from "@/components/BankLogo";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency, getCurrentMonth, getMonthPaymentStatus } from "@/lib/installments";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { getCardDetailCache, setCardDetailCache } from "@/lib/cardDetailCache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as CardDetailNavState;
  const [userId, setUserId] = useState<string | null>(navState.initialUserId || null);
  const [card, setCard] = useState<Card | null>(navState.initialCard || null);
  const [allCards, setAllCards] = useState<Card[]>(navState.initialCards || []);
  const [month, setMonth] = useState(searchParams.get("mes") || getCurrentMonth());
  const [installments, setInstallments] = useState<any[]>([]);
  const [manualSubgroupNames, setManualSubgroupNames] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(navState.initialProfile || null);
  const [loading, setLoading] = useState(true);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [editingSubgroupId, setEditingSubgroupId] = useState<string | null>(null);
  const [editingSubgroupName, setEditingSubgroupName] = useState("");

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
      supabase.from("cards").select("id, name, brand, default_due_day").eq("id", cardId).single(),
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId).order("created_at"),
      supabase
        .from("installments")
        .select("id, installment_number, installments_count, due_day, amount, status, ref_month, purchase_id, purchases(id, description, person)")
        .eq("card_id", cardId)
        .or(`ref_month.eq.${month},and(ref_month.lt.${month},status.eq.pendente)`)
        .order("due_day")
        .order("installment_number"),
      profilePromise,
    ]);

    let instData: any[] = instResult.data || [];
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
      toast.error("Este usuario ja existe na lista");
      return;
    }
    const next = [...manualSubgroupNames, name];
    setManualSubgroupNames(next);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(next));
    toast.success("Usuario criado");
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
      toast.error("Erro ao atualizar usuario: " + error.message);
      return;
    }
    const nextManual = manualSubgroupNames.map((name) => (name === oldName ? newName : name));
    setManualSubgroupNames(nextManual);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(nextManual));
    toast.success("Usuario atualizado");
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
      toast.error("Erro ao excluir usuario: " + error.message);
      return;
    }
    const nextManual = manualSubgroupNames.filter((name) => name !== subgroupName);
    setManualSubgroupNames(nextManual);
    localStorage.setItem(getManualSubgroupsKey(userId, cardId), JSON.stringify(nextManual));
    toast.success("Usuario excluido com todas as compras vinculadas");
    fetchData();
  };

  const deleteCard = async () => {
    if (!cardId) return;
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    if (error) {
      toast.error("Erro ao excluir cartao: " + error.message);
      return;
    }
    toast.success("Cartao excluido");
    navigate("/");
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
    const status = getMonthPaymentStatus(installments, month);
    if (status === "paid") {
      return { label: "Pago", className: "border-success/30 bg-success/10 text-success" };
    }
    if (status === "open") {
      return { label: "Em aberto", className: "border-warning/35 bg-warning/15 text-[hsl(var(--warning-foreground))]" };
    }
    return { label: "Sem lancamentos", className: "border-border bg-secondary text-secondary-foreground" };
  }, [installments, month]);

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="-ml-2 mb-3 gap-1 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BankLogo brand={card?.brand} size={52} />
              <div>
                <h1 className="font-heading text-2xl font-bold text-primary-foreground">{card?.name || "Carregando..."}</h1>
              </div>
            </div>
            <UserAvatar avatarId={profile?.avatar_id} name={profile?.name} size={50} />
          </div>
        </div>
      </header>

      <div className="container -mt-4 space-y-4">
        {card ? (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-elevated animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
              <Badge variant="outline" className={monthStatusUI.className}>
                {monthStatusUI.label}
              </Badge>
            </div>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Excluir cartao
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
          </div>
        </div>
        ) : (
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <section className="order-2 h-full rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in xl:order-2">
            <div className="mb-3 flex w-full items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">Quem usou o cartão ?</h2>
                <p className="text-xs text-muted-foreground">Adicione quem pediu seu cartão emprestado</p>
              </div>
              <p className="text-xs text-muted-foreground">{subgroups.length} usuario(s)</p>
            </div>

            <div className="mb-3 flex flex-row items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Ex: Pai, Tio, Primo"
                value={newSubgroupName}
                onChange={(e) => setNewSubgroupName(e.target.value)}
              />
              <Button className="shrink-0 gap-2" onClick={createSubgroup}>
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
                                title="Excluir subgrupo"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir subgrupo "{subgroup.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Todas as compras e parcelas vinculadas serao excluidas imediatamente.{" "}
                                  {inUse ? "Este subgrupo possui parcelas no mes atual." : ""}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteSubgroup(subgroup.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir subgrupo
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
          </section>

          <section className="order-1 h-full rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in xl:order-1">
            <h2 className="font-heading text-lg font-bold text-foreground">Divisão de Gastos</h2>

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
                          animationBegin={0}
                          animationDuration={360}
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

                <div className="space-y-2">
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
          />
        )}
      </div>
    </div>
  );
};

export default CardDetail;
