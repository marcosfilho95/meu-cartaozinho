import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatMonth } from "@/lib/installments";
import { toast } from "sonner";
import { Check, ChevronDown, Circle, MousePointerClick, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { AddPurchaseDialog } from "@/components/AddPurchaseDialog";

interface Installment {
  id: string;
  installment_number: number;
  installments_count: number;
  due_day: number;
  amount: number;
  status: string;
  purchase_id: string;
  ref_month?: string;
}

interface PurchaseInfo {
  id: string;
  description: string;
  person: string | null;
  subgroup_id: string | null;
  card_subgroups?: { name: string } | null;
}

interface InstallmentListProps {
  installments: (Installment & { purchases: PurchaseInfo | null })[];
  currentMonth: string;
  userId: string;
  cards: { id: string; name: string; brand: string | null; default_due_day: number | null }[];
  cardId: string;
  subgroupNames: string[];
  onUpdate: () => void;
  onInstallmentsChange?: (items: (Installment & { purchases: PurchaseInfo | null })[]) => void;
}

export const InstallmentList: React.FC<InstallmentListProps> = ({
  installments,
  currentMonth,
  userId,
  cards,
  cardId,
  subgroupNames,
  onUpdate,
  onInstallmentsChange,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [localInstallments, setLocalInstallments] = useState(installments);

  useEffect(() => {
    setLocalInstallments(installments);
  }, [installments]);

  const toggleStatus = async (inst: Installment) => {
    const newStatus = inst.status === "pago" ? "pendente" : "pago";
    const { error } = await supabase
      .from("installments")
      .update({
        status: newStatus,
        paid_at: newStatus === "pago" ? new Date().toISOString() : null,
      })
      .eq("id", inst.id);

    if (error) {
      toast.error("Erro ao atualizar parcela: " + error.message);
      return;
    }
    setLocalInstallments((prev) => {
      const next = prev.map((item) =>
        item.id === inst.id
          ? { ...item, status: newStatus }
          : item,
      );
      onInstallmentsChange?.(next);
      return next;
    });
  };

  const setGroupStatus = async (groupItems: (Installment & { purchases: PurchaseInfo | null })[], status: "pago" | "pendente") => {
    const ids = groupItems.map((item) => item.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("installments")
      .update({
        status,
        paid_at: status === "pago" ? new Date().toISOString() : null,
      })
      .in("id", ids);
    if (error) {
      toast.error("Erro ao atualizar subgrupo: " + error.message);
      return;
    }
    setLocalInstallments((prev) => {
      const next = prev.map((item) =>
        ids.includes(item.id)
          ? { ...item, status }
          : item,
      );
      onInstallmentsChange?.(next);
      return next;
    });
  };

  const deletePurchase = async (purchaseId: string, description: string) => {
    const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
    if (error) {
      toast.error("Erro ao excluir compra: " + error.message);
      return;
    }
    toast.success(`Compra "${description}" excluida`);
    onUpdate();
  };

  const grouped = useMemo(() => {
    const groups: Record<
      string,
      {
        subgroupId: string;
        subgroupName: string;
        items: (Installment & { purchases: PurchaseInfo | null })[];
      }
    > = {};

    subgroupNames.forEach((name) => {
      const cleaned = name.trim();
      if (!cleaned) return;
      groups[cleaned] = { subgroupId: cleaned, subgroupName: cleaned, items: [] };
    });

    localInstallments.forEach((inst) => {
      const subgroupId = inst.purchases?.person || "sem-subgrupo";
      const subgroupName = inst.purchases?.person || "Sem subgrupo";
      if (!groups[subgroupId]) {
        groups[subgroupId] = { subgroupId, subgroupName, items: [] };
      }
      groups[subgroupId].items.push(inst);
    });

    return Object.values(groups)
      .sort((a, b) => a.subgroupName.localeCompare(b.subgroupName))
      .map((group) => {
      const purchasesMap: Record<string, (Installment & { purchases: PurchaseInfo | null })[]> = {};
      group.items.forEach((inst) => {
        if (!purchasesMap[inst.purchase_id]) purchasesMap[inst.purchase_id] = [];
        purchasesMap[inst.purchase_id].push(inst);
      });
      const purchases = Object.entries(purchasesMap).map(([purchaseId, rows]) => ({
        purchaseId,
        info: rows[0].purchases,
        rows: rows.sort((a, b) => a.installment_number - b.installment_number),
      }));
      return {
        ...group,
        subtotal: group.items.reduce((sum, item) => sum + Number(item.amount), 0),
        overdueCount: group.items.filter((item) => item.status === "pendente" && item.ref_month && item.ref_month < currentMonth).length,
        purchases,
      };
    });
  }, [localInstallments, currentMonth, subgroupNames]);

  if (localInstallments.length === 0 && subgroupNames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 text-center animate-fade-in">
        <p className="font-heading text-xl font-bold text-foreground">Nenhuma conta para este mes</p>
        <p className="mt-1 text-sm text-muted-foreground">Adicione compras para visualizar esta fatura.</p>
      </div>
    );
  }

  const total = localInstallments.reduce((sum, i) => sum + Number(i.amount), 0);
  const activeCount = localInstallments.filter((i) => i.status === "pendente").length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-2 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-background">
            <MousePointerClick className="h-3.5 w-3.5 text-primary" />
          </span>
          Clique em "Confirmar" para marcar a parcela como paga.
        </p>
      </div>
      {grouped.map((group) => {
        const isCollapsed = collapsedGroups[group.subgroupId] || false;
        return (
          <section key={group.subgroupId} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div
              role="button"
              className="flex w-full flex-col gap-3 bg-accent/35 px-4 py-3 text-left transition-colors hover:bg-accent/55 sm:flex-row sm:items-center sm:justify-between"
              onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.subgroupId]: !isCollapsed }))}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isCollapsed ? "-rotate-90" : "rotate-0"}`} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading text-base font-bold text-foreground">{group.subgroupName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {group.purchases.length} compra(s) - subtotal {formatCurrency(group.subtotal)}
                    {group.overdueCount > 0 ? ` - ${group.overdueCount} atrasada(s)` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {isCollapsed ? "Toque para expandir" : "Toque para recolher"}
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {group.subgroupId !== "sem-subgrupo" && (
                  <AddPurchaseDialog
                    userId={userId}
                    cards={cards}
                    onPurchaseAdded={onUpdate}
                    defaultCardId={cardId}
                    lockCardId
                    forcedPersonName={group.subgroupName}
                    disableDbSubgroups
                    trigger={
                      <Button
                        size="sm"
                        className="h-8 rounded-xl gradient-primary px-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/45 ring-2 ring-primary/25 transition-all hover:-translate-y-0.5 hover:brightness-105 sm:h-9 sm:px-4 sm:text-sm sm:font-extrabold"
                      >
                        + Nova conta
                      </Button>
                    }
                  />
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs sm:h-7"
                  disabled={group.items.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupStatus(group.items, "pago");
                  }}
                >
                  Pagar tudo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs sm:h-7"
                  disabled={group.items.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupStatus(group.items, "pendente");
                  }}
                >
                  Desfazer
                </Button>
              </div>
            </div>

            <div className={`grid transition-all duration-300 ease-out ${isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <div className="overflow-hidden">
                <div className="space-y-3 p-3">
                  {group.purchases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/80 bg-background/40 p-4 text-sm text-muted-foreground">
                      Nenhuma conta neste usuario ainda. Clique em <span className="font-semibold text-foreground">+ Nova conta</span> para cadastrar.
                    </div>
                  ) : (
                    group.purchases.map((purchase) => (
                    <article key={purchase.purchaseId} className="rounded-lg border border-border/80 bg-background/65 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate font-semibold text-card-foreground">{purchase.info?.description || "Compra"}</h4>
                          <p className="text-xs text-muted-foreground">
                            {purchase.info?.person ? `Pessoa: ${purchase.info.person}` : "Sem pessoa vinculada"}
                          </p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir compra?</AlertDialogTitle>
                              <AlertDialogDescription>Essa acao exclui a compra e todas as parcelas restantes imediatamente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePurchase(purchase.purchaseId, purchase.info?.description || "Compra")}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir compra
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <div className="space-y-2">
                        {purchase.rows.map((inst) => {
                          const isOverdue = inst.status === "pendente" && !!inst.ref_month && inst.ref_month < currentMonth;
                          return (
                            <div
                              key={inst.id}
                              className={`flex items-center gap-3 rounded-md border p-2 transition-colors ${
                                inst.status === "pago"
                                  ? "border-success/40 bg-success/5"
                                  : isOverdue
                                    ? "border-destructive/35 bg-destructive/5"
                                    : "border-border/70 bg-card"
                              }`}
                            >
                              <button
                                onClick={() => toggleStatus(inst)}
                                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-all duration-300 ${
                                  inst.status === "pago"
                                    ? "border-success bg-success/10 text-success hover:bg-success/20"
                                    : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                                }`}
                              >
                                {inst.status === "pago" ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                                {inst.status === "pago" ? "Desfazer" : "Confirmar"}
                              </button>
                              <div className="min-w-0 flex-1">
                                {isOverdue && (
                                  <p className="mb-0.5 text-[11px] font-semibold text-destructive">
                                    Conta atrasada ({formatMonth(inst.ref_month || currentMonth)})
                                  </p>
                                )}
                                <p className={`text-sm ${inst.status === "pago" ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                                  Parcela {inst.installment_number}/{inst.installments_count} - Dia {inst.due_day}
                                </p>
                              </div>
                              <span className={`font-heading text-sm font-bold ${inst.status === "pago" ? "text-success" : "text-foreground"}`}>
                                {formatCurrency(Number(inst.amount))}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <div className="flex items-center justify-between rounded-xl bg-accent/45 p-4">
        <div>
          <p className="font-heading text-base font-bold text-foreground">Total do mes</p>
          <p className="text-xs text-muted-foreground">{activeCount} parcela(s) ativa(s)</p>
        </div>
        <p className="font-heading text-xl font-bold text-foreground">{formatCurrency(total)}</p>
      </div>
    </div>
  );
};

