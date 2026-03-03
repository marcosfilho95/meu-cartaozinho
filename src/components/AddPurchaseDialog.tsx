import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, AlertCircle } from "lucide-react";
import { generateInstallments, formatMonth, formatCurrency, getCurrentMonth } from "@/lib/installments";

const purchaseSchema = z.object({
  card_id: z.string().uuid("Selecione um cartão"),
  description: z.string().trim().min(1, "Descrição é obrigatória").max(100),
  total_amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  installments_count: z.coerce.number().int().min(1, "Mínimo 1 parcela").max(60, "Máximo 60 parcelas"),
  due_day: z.coerce.number().int().min(1, "Dia mínimo: 1").max(28, "Dia máximo: 28"),
  start_month: z.string().regex(/^\d{4}-\d{2}$/, "Formato YYYY-MM"),
  notes: z.string().max(500).optional(),
  person: z.string().max(50).optional(),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

interface Card {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

interface AddPurchaseDialogProps {
  userId: string;
  cards: Card[];
  onPurchaseAdded: () => void;
  defaultCardId?: string;
  trigger?: React.ReactNode;
}

export const AddPurchaseDialog: React.FC<AddPurchaseDialogProps> = ({
  userId,
  cards,
  onPurchaseAdded,
  defaultCardId,
  trigger,
}) => {
  const [open, setOpen] = useState(false);

  const defaultCard = cards.find((c) => c.id === defaultCardId) || cards[0];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      card_id: defaultCardId || "",
      description: "",
      total_amount: 0,
      installments_count: 1,
      due_day: defaultCard?.default_due_day || 5,
      start_month: getCurrentMonth(),
      notes: "",
      person: "",
    },
  });

  const totalAmount = watch("total_amount");
  const installmentsCount = watch("installments_count");
  const dueDay = watch("due_day");
  const startMonth = watch("start_month");

  const preview = useMemo(() => {
    if (totalAmount > 0 && installmentsCount >= 1 && dueDay >= 1 && dueDay <= 28 && /^\d{4}-\d{2}$/.test(startMonth)) {
      return generateInstallments({
        totalAmount,
        installmentsCount,
        dueDay,
        startMonth,
      });
    }
    return null;
  }, [totalAmount, installmentsCount, dueDay, startMonth]);

  const onSubmit = async (data: PurchaseForm) => {
    // Insert purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        card_id: data.card_id,
        description: data.description,
        total_amount: data.total_amount,
        installments_count: data.installments_count,
        due_day: data.due_day,
        start_month: data.start_month,
        notes: data.notes || null,
        person: data.person || null,
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      toast.error("Erro ao salvar compra: " + (purchaseError?.message || "Erro desconhecido"));
      return;
    }

    // Generate and insert installments
    const installments = generateInstallments({
      totalAmount: data.total_amount,
      installmentsCount: data.installments_count,
      dueDay: data.due_day,
      startMonth: data.start_month,
    });

    const rows = installments.map((inst) => ({
      user_id: userId,
      purchase_id: purchase.id,
      card_id: data.card_id,
      installment_number: inst.installmentNumber,
      installments_count: data.installments_count,
      ref_month: inst.refMonth,
      due_day: inst.dueDay,
      amount: inst.amount,
      status: "pendente" as const,
    }));

    const { error: instError } = await supabase.from("installments").insert(rows);

    if (instError) {
      toast.error("Erro ao gerar parcelas: " + instError.message);
      return;
    }

    toast.success(`Compra salva com ${data.installments_count} parcela(s)! ✅`);
    reset();
    setOpen(false);
    onPurchaseAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Compra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Nova Compra Parcelada</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {cards.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              <AlertCircle className="h-4 w-4" />
              Você precisa cadastrar um cartão primeiro.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Cartão</Label>
                <Select
                  value={watch("card_id")}
                  onValueChange={(val) => {
                    setValue("card_id", val);
                    const card = cards.find((c) => c.id === val);
                    if (card?.default_due_day) {
                      setValue("due_day", card.default_due_day);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.card_id && <p className="text-sm text-destructive">{errors.card_id.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input placeholder="Ex: Celular do João" {...register("description")} />
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Para quem (opcional)</Label>
                <Input placeholder="Ex: João" {...register("person")} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor total (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="1500.00" {...register("total_amount")} />
                  {errors.total_amount && <p className="text-sm text-destructive">{errors.total_amount.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input type="number" min={1} max={60} placeholder="10" {...register("installments_count")} />
                  {errors.installments_count && <p className="text-sm text-destructive">{errors.installments_count.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Dia de cobrança</Label>
                  <Input type="number" min={1} max={28} placeholder="5" {...register("due_day")} />
                  {errors.due_day && <p className="text-sm text-destructive">{errors.due_day.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Mês inicial</Label>
                  <Input type="month" {...register("start_month")} />
                  {errors.start_month && <p className="text-sm text-destructive">{errors.start_month.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea placeholder="Notas adicionais..." {...register("notes")} />
              </div>

              {/* Preview */}
              {preview && preview.length > 0 && (
                <div className="rounded-lg border border-border bg-accent/50 p-3">
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    📋 Preview: {preview.length} parcela(s)
                  </p>
                  <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {preview.map((p) => (
                      <div key={p.installmentNumber} className="flex justify-between">
                        <span>{formatMonth(p.refMonth)} (dia {p.dueDay})</span>
                        <span className="font-medium">
                          {p.installmentNumber}/{preview.length} — {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                    <span>Total</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isSubmitting || cards.length === 0}>
                {isSubmitting ? "Salvando..." : "Salvar Compra"}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
