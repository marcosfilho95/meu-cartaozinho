import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/installments";
import { toast } from "sonner";
import { Check, ChevronDown, Circle, Trash2 } from "lucide-react";
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

interface Installment {
  id: string;
  installment_number: number;
  installments_count: number;
  due_day: number;
  amount: number;
  status: string;
  purchase_id: string;
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
  onUpdate: () => void;
}

export const InstallmentList: React.FC<InstallmentListProps> = ({ installments, onUpdate }) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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
    toast.success(newStatus === "pago" ? "Parcela marcada como paga" : "Parcela voltou para pendente");
    onUpdate();
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
    toast.success(status === "pago" ? "Subgrupo marcado como pago" : "Subgrupo desmarcado");
    onUpdate();
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

    installments.forEach((inst) => {
      const subgroupId = inst.purchases?.subgroup_id || inst.purchases?.person || "sem-subgrupo";
      const subgroupName = inst.purchases?.card_subgroups?.name || inst.purchases?.person || "Sem subgrupo";
      if (!groups[subgroupId]) {
        groups[subgroupId] = { subgroupId, subgroupName, items: [] };
      }
      groups[subgroupId].items.push(inst);
    });

    return Object.values(groups).map((group) => {
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
        purchases,
      };
    });
  }, [installments]);

  if (installments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 text-center animate-fade-in">
        <p className="font-heading text-xl font-bold text-foreground">Nenhuma conta para este mes</p>
        <p className="mt-1 text-sm text-muted-foreground">Adicione compras para visualizar esta fatura.</p>
      </div>
    );
  }

  const total = installments.reduce((sum, i) => sum + Number(i.amount), 0);
  const activeCount = installments.filter((i) => i.status === "pendente").length;

  return (
    <div className="space-y-4 animate-fade-in">
      {grouped.map((group) => {
        const isCollapsed = collapsedGroups[group.subgroupId] || false;
        return (
          <section key={group.subgroupId} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <div
              role="button"
              className="flex w-full items-center justify-between gap-3 bg-accent/35 px-4 py-3 text-left transition-colors hover:bg-accent/55"
              onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.subgroupId]: !isCollapsed }))}
            >
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">{group.subgroupName}</h3>
                <p className="text-xs text-muted-foreground">
                  {group.purchases.length} compra(s) - subtotal {formatCurrency(group.subtotal)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGroupStatus(group.items, "pendente");
                  }}
                >
                  Desfazer
                </Button>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${isCollapsed ? "" : "rotate-180"}`} />
              </div>
            </div>

            <div className={`grid transition-all duration-300 ease-out ${isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <div className="overflow-hidden">
                <div className="space-y-3 p-3">
                  {group.purchases.map((purchase) => (
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
                        {purchase.rows.map((inst) => (
                          <div
                            key={inst.id}
                            className={`flex items-center gap-3 rounded-md border p-2 transition-colors ${
                              inst.status === "pago" ? "border-success/40 bg-success/5" : "border-border/70 bg-card"
                            }`}
                          >
                            <button
                              onClick={() => toggleStatus(inst)}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                inst.status === "pago" ? "border-success bg-success text-success-foreground" : "border-border hover:border-primary"
                              }`}
                            >
                              {inst.status === "pago" ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${inst.status === "pago" ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                                Parcela {inst.installment_number}/{inst.installments_count} - Dia {inst.due_day}
                              </p>
                            </div>
                            <span className={`font-heading text-sm font-bold ${inst.status === "pago" ? "text-success" : "text-foreground"}`}>
                              {formatCurrency(Number(inst.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
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

