import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BANK_OPTIONS, BankLogo } from "@/components/BankLogo";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const cardSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(50),
  brand: z.string().optional(),
  default_due_day: z.union([z.coerce.number().int().min(1).max(28), z.literal(0)]).optional(),
});

type CardForm = z.infer<typeof cardSchema>;

interface AddCardDialogProps {
  userId: string;
  onCardAdded: () => void;
  trigger?: React.ReactNode;
}

export const AddCardDialog: React.FC<AddCardDialogProps> = ({ userId, onCardAdded, trigger }) => {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: { name: "", brand: "outro", default_due_day: 0 },
  });

  const brand = watch("brand");

  const onSubmit = async (data: CardForm) => {
    const { error } = await supabase.from("cards").insert({
      user_id: userId,
      name: data.name,
      brand: data.brand || null,
      default_due_day: data.default_due_day && data.default_due_day > 0 ? data.default_due_day : null,
    });

    if (error) {
      toast.error("Erro ao criar cartão: " + error.message);
      return;
    }

    toast.success("Cartão adicionado! 🎉");
    reset();
    setOpen(false);
    onCardAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" />
            Novo Cartão
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Adicionar Cartão</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Emissor / Banco</Label>
            <Select
              value={brand || "outro"}
              onValueChange={(val) => {
                setValue("brand", val);
                const bankName = BANK_OPTIONS.find((b) => b.value === val)?.label;
                if (bankName && val !== "outro") {
                  setValue("name", bankName);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    <div className="flex items-center gap-2">
                      <BankLogo brand={b.value} size={24} />
                      {b.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-name">Nome do cartão</Label>
            <Input
              id="card-name"
              placeholder="Ex: Nubank Roxinho"
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="due-day">Dia de vencimento padrão (opcional)</Label>
            <Input
              id="due-day"
              type="number"
              min={1}
              max={28}
              placeholder="1–28"
              {...register("default_due_day")}
            />
          </div>

          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar Cartão"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
