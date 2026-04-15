import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertCircle, Plus } from "lucide-react";
import { addMonths, generateInstallments, formatMonth, formatCurrency, getCurrentMonth } from "@/lib/installments";

const purchaseSchema = z.object({
  card_id: z.string().uuid("Selecione um cartao"),
  subgroup_id: z.string().optional(),
  subgroup_name: z.string().trim().max(50).optional(),
  description: z.string().trim().min(1, "Descricao obrigatoria").max(100),
  installment_amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  installments_count: z.coerce.number().int().min(1, "Minimo 1 parcela").max(60, "Maximo 60 parcelas"),
  due_day: z.coerce.number().int().min(1, "Dia minimo: 1").max(28, "Dia maximo: 28"),
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

interface CardSubgroup {
  id: string;
  card_id: string;
  name: string;
}

interface AddPurchaseDialogProps {
  userId: string;
  cards: Card[];
  onPurchaseAdded: () => void;
  defaultCardId?: string;
  forcedSubgroupId?: string;
  forcedSubgroupName?: string;
  forcedPersonName?: string;
  lockCardId?: boolean;
  disableDbSubgroups?: boolean;
  trigger?: React.ReactNode;
}

export const AddPurchaseDialog: React.FC<AddPurchaseDialogProps> = ({
  userId,
  cards,
  onPurchaseAdded,
  defaultCardId,
  forcedSubgroupId,
  forcedSubgroupName,
  forcedPersonName,
  lockCardId = false,
  disableDbSubgroups = false,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [subgroups, setSubgroups] = useState<CardSubgroup[]>([]);
  const [isCreatingSubgroup, setIsCreatingSubgroup] = useState(false);
  const [subgroupFeatureAvailable, setSubgroupFeatureAvailable] = useState(true);

  const defaultCard = cards.find((c) => c.id === defaultCardId) || cards[0];
  const isSubgroupQuickCreate = Boolean((forcedSubgroupId || forcedPersonName) && lockCardId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      card_id: defaultCardId || cards[0]?.id || "",
      subgroup_id: forcedSubgroupId || "",
      subgroup_name: "",
      description: "",
      installment_amount: 0,
      installments_count: 1,
      due_day: defaultCard?.default_due_day || 5,
      start_month: getCurrentMonth(),
      notes: "",
      person: "",
    },
  });

  const selectedCardId = watch("card_id");
  const selectedSubgroupId = watch("subgroup_id");
  const installmentAmount = watch("installment_amount");
  const installmentsCount = watch("installments_count");
  const dueDay = watch("due_day");
  const startMonth = watch("start_month");
  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const nextMonth = useMemo(() => addMonths(currentMonth, 1), [currentMonth]);
  const totalAmount = useMemo(
    () => Math.round(Number(installmentAmount || 0) * Number(installmentsCount || 0) * 100) / 100,
    [installmentAmount, installmentsCount],
  );

  useEffect(() => {
    if (!open || !selectedCardId) return;
    if (disableDbSubgroups) {
      setSubgroupFeatureAvailable(false);
      setSubgroups([]);
      setValue("subgroup_id", "");
      return;
    }
    if (forcedSubgroupId) {
      setValue("subgroup_id", forcedSubgroupId);
      return;
    }
    const loadSubgroups = async () => {
      const { data, error } = await (supabase
        .from("card_subgroups" as any)
        .select("id, card_id, name")
        .eq("user_id", userId)
        .eq("card_id", selectedCardId)
        .order("created_at") as any);
      if (error) {
        const message = String(error.message || "");
        const isMissingSubgroupTable =
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          message.includes("card_subgroups") ||
          message.toLowerCase().includes("could not find the table");
        if (isMissingSubgroupTable) {
          setSubgroupFeatureAvailable(false);
          setSubgroups([]);
          setValue("subgroup_id", "");
          return;
        }
        toast.error("Erro ao carregar subgrupos: " + error.message);
        return;
      }
      setSubgroupFeatureAvailable(true);
      setSubgroups((data as CardSubgroup[]) || []);
      const first = data?.[0];
      setValue("subgroup_id", first?.id || "");
      setIsCreatingSubgroup(!first);
    };
    loadSubgroups();
  }, [open, selectedCardId, userId, setValue, forcedSubgroupId, disableDbSubgroups]);

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
    const useDbSubgroups = subgroupFeatureAvailable && !disableDbSubgroups;
    let subgroupId = forcedSubgroupId || data.subgroup_id || "";

    if (!forcedSubgroupId && useDbSubgroups && isCreatingSubgroup) {
      const subgroupName = data.subgroup_name?.trim();
      if (!subgroupName) {
        toast.error("Informe o nome do subgrupo");
        return;
      }
      const { data: subgroup, error: subgroupError } = await (supabase
        .from("card_subgroups" as any)
        .insert({
          user_id: userId,
          card_id: data.card_id,
          name: subgroupName,
        })
        .select("id")
        .single() as any);
      if (subgroupError || !subgroup) {
        toast.error("Erro ao criar subgrupo: " + (subgroupError?.message || "Erro desconhecido"));
        return;
      }
      subgroupId = subgroup.id;
    }

    if (!forcedSubgroupId && useDbSubgroups && !subgroupId) {
      toast.error("Selecione um subgrupo");
      return;
    }

    const subgroupLabel = (data.subgroup_name || "").trim();
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        card_id: data.card_id,
        ...(useDbSubgroups ? { subgroup_id: subgroupId } : {}),
        description: data.description,
        total_amount: totalAmount,
        installments_count: data.installments_count,
        due_day: data.due_day,
        start_month: data.start_month,
        notes: data.notes || null,
        person: forcedPersonName || data.person || (!useDbSubgroups && subgroupLabel ? subgroupLabel : null),
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      const message = String(purchaseError?.message || "");
      if (purchaseError?.code === "42703" && message.includes("subgroup_id")) {
        setSubgroupFeatureAvailable(false);
        toast.error("Subgrupos ainda nao foram criados no banco. Rode a migration para habilitar.");
        return;
      }
      toast.error("Erro ao salvar compra: " + (purchaseError?.message || "Erro desconhecido"));
      return;
    }

    const installments = generateInstallments({
      totalAmount,
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

    toast.success(`Compra salva com ${data.installments_count} parcela(s)`);
    reset({
      card_id: data.card_id,
      subgroup_id: subgroupId,
      subgroup_name: "",
      description: "",
      installment_amount: 0,
      installments_count: 1,
      due_day: data.due_day,
      start_month: getCurrentMonth(),
      notes: "",
      person: "",
    });
    setOpen(false);
    setIsCreatingSubgroup(false);
    onPurchaseAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
            Adicionar compra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{isSubgroupQuickCreate ? "Nova conta" : "Nova compra parcelada"}</DialogTitle>
          <DialogDescription>
            {isSubgroupQuickCreate ? "Cadastre a conta deste usuario neste cartao." : "Cadastre compras parceladas e organize sua fatura por mes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {cards.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              <AlertCircle className="h-4 w-4" />
              Voce precisa cadastrar um cartao antes.
            </div>
          ) : (
            <>
              {!isSubgroupQuickCreate && (
                <div className="space-y-2">
                  <Label>Cartao</Label>
                  {lockCardId ? (
                    <Input value={cards.find((c) => c.id === selectedCardId)?.name || "Cartao selecionado"} disabled />
                  ) : (
                    <Select
                      value={selectedCardId}
                      onValueChange={(val) => {
                        setValue("card_id", val);
                        setIsCreatingSubgroup(false);
                        setValue("subgroup_name", "");
                        const card = cards.find((c) => c.id === val);
                        if (card?.default_due_day) {
                          setValue("due_day", card.default_due_day);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cartao" />
                      </SelectTrigger>
                      <SelectContent>
                        {cards.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {errors.card_id && <p className="text-sm text-destructive">{errors.card_id.message}</p>}
                </div>
              )}

              {!isSubgroupQuickCreate &&
                (forcedSubgroupId ? (
                  <div className="space-y-2">
                    <Label>Quem usou o cartao</Label>
                    <Input value={forcedSubgroupName || "Subgrupo selecionado"} disabled />
                  </div>
                ) : subgroupFeatureAvailable ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Subgrupo</Label>
                      <button
                        type="button"
                        onClick={() => setIsCreatingSubgroup((prev) => !prev)}
                        className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                      >
                        {isCreatingSubgroup ? "Usar existente" : "Criar novo"}
                      </button>
                    </div>
                    {isCreatingSubgroup ? (
                      <Input placeholder="Ex: Pai, Avo, Namorado" {...register("subgroup_name")} />
                    ) : (
                      <Select value={selectedSubgroupId || ""} onValueChange={(val) => setValue("subgroup_id", val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o subgrupo" />
                        </SelectTrigger>
                        <SelectContent>
                          {subgroups.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Subgrupo (temporario)</Label>
                    <Input placeholder="Ex: Pai, Avo, Namorado" {...register("subgroup_name")} />
                    <p className="text-xs text-muted-foreground">
                      A tabela de subgrupos ainda nao existe no banco. O valor sera salvo em "Para quem".
                    </p>
                  </div>
                ))}

              <div className="space-y-2">
                <Label>Descricao</Label>
                <Input placeholder="Ex: Celular do Joao" {...register("description")} />
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>

              {!isSubgroupQuickCreate && (
                <div className="space-y-2">
                  <Label>Para quem (opcional)</Label>
                  <Input placeholder="Ex: Joao" {...register("person")} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor da parcela (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="150.00" {...register("installment_amount")} />
                  {errors.installment_amount && <p className="text-sm text-destructive">{errors.installment_amount.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input type="number" min={1} max={60} placeholder="10" {...register("installments_count")} />
                  {errors.installments_count && <p className="text-sm text-destructive">{errors.installments_count.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Dia de cobranca</Label>
                  <Input type="number" min={1} max={28} placeholder="5" {...register("due_day")} />
                  {errors.due_day && <p className="text-sm text-destructive">{errors.due_day.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Primeiro vencimento</Label>
                  <Input type="month" {...register("start_month")} />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setValue("start_month", currentMonth)}>
                      Este mes
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setValue("start_month", nextMonth)}>
                      Proximo mes
                    </Button>
                  </div>
                  {errors.start_month && <p className="text-sm text-destructive">{errors.start_month.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observacoes (opcional)</Label>
                <Textarea placeholder="Notas adicionais" {...register("notes")} />
              </div>

              {preview && preview.length > 0 && (
                <div className="rounded-xl border border-border bg-accent/40 p-3">
                  <p className="mb-2 text-sm font-semibold text-foreground">Preview: {preview.length} parcela(s)</p>
                  <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {preview.map((p) => (
                      <div key={p.installmentNumber} className="flex justify-between">
                        <span>
                          {formatMonth(p.refMonth)} (dia {p.dueDay})
                        </span>
                        <span className="font-medium">
                          {p.installmentNumber}/{preview.length} - {formatCurrency(p.amount)}
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
                {isSubmitting ? "Salvando..." : isSubgroupQuickCreate ? "Salvar conta" : "Salvar compra"}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
