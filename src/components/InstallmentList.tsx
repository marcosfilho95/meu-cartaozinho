import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/installments";
import { toast } from "sonner";
import { Check, Circle } from "lucide-react";

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
  description: string;
  person: string | null;
}

interface InstallmentListProps {
  installments: (Installment & { purchases: PurchaseInfo | null })[];
  onUpdate: () => void;
}

export const InstallmentList: React.FC<InstallmentListProps> = ({ installments, onUpdate }) => {
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
      toast.error("Erro ao atualizar: " + error.message);
      return;
    }
    toast.success(newStatus === "pago" ? "Marcada como paga! ✅" : "Desmarcada");
    onUpdate();
  };

  if (installments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
        <span className="text-4xl mb-3">🎉</span>
        <p className="font-heading text-lg font-semibold text-foreground">Sem contas a pagar neste mês</p>
        <p className="text-sm text-muted-foreground mt-1">Tudo em dia!</p>
      </div>
    );
  }

  const total = installments.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = installments.filter((i) => i.status === "pago").reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="space-y-2 animate-fade-in">
      {installments.map((inst) => (
        <div
          key={inst.id}
          className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
            inst.status === "pago"
              ? "border-success/30 bg-success/5"
              : "border-border bg-card"
          }`}
        >
          <button
            onClick={() => toggleStatus(inst)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              inst.status === "pago"
                ? "border-success bg-success text-success-foreground"
                : "border-border hover:border-primary"
            }`}
          >
            {inst.status === "pago" ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${inst.status === "pago" ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
              {inst.purchases?.description || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Parcela {inst.installment_number}/{inst.installments_count} • Dia {inst.due_day}
              {inst.purchases?.person && ` • ${inst.purchases.person}`}
            </p>
          </div>

          <span className={`font-heading font-bold ${inst.status === "pago" ? "text-success" : "text-foreground"}`}>
            {formatCurrency(Number(inst.amount))}
          </span>
        </div>
      ))}

      <div className="flex justify-between items-center rounded-lg bg-accent/50 p-3 mt-3">
        <span className="font-heading font-semibold text-foreground">Total do mês</span>
        <div className="text-right">
          <p className="font-heading text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          {totalPaid > 0 && (
            <p className="text-xs text-success">Pago: {formatCurrency(totalPaid)}</p>
          )}
        </div>
      </div>
    </div>
  );
};
