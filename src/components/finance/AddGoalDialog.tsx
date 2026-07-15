import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

interface AddGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}

const GOAL_TYPES = [
  { value: "emergency", label: "Reserva de emergência" },
  { value: "travel", label: "Viagem e experiências" },
  { value: "home", label: "Casa ou apartamento" },
  { value: "family", label: "Filhos e família" },
  { value: "education", label: "Educação" },
  { value: "retirement", label: "Aposentadoria" },
  { value: "other", label: "Outro objetivo" },
] as const;

const GOAL_TEMPLATES = [
  { label: "Emergência", name: "Reserva de emergência", type: "emergency", target: "30000", monthly: "1000" },
  { label: "Viagem", name: "Viagem dos sonhos", type: "travel", target: "12000", monthly: "500" },
  { label: "Apartamento", name: "Entrada do apartamento", type: "home", target: "100000", monthly: "2000" },
  { label: "Filhos", name: "Futuro dos filhos", type: "family", target: "30000", monthly: "500" },
] as const;

const parseMoney = (value: string) => {
  const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return Number(normalized);
};

export const AddGoalDialog: React.FC<AddGoalDialogProps> = ({ open, onOpenChange, userId, onCreated }) => {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [goalType, setGoalType] = useState("other");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome da meta"); return; }
    const amount = parseMoney(targetAmount);
    if (!amount || amount <= 0) { toast.error("Informe um valor alvo válido"); return; }
    const monthly = monthlyTarget.trim() ? parseMoney(monthlyTarget) : 0;
    if (!Number.isFinite(monthly) || monthly < 0) { toast.error("Informe uma meta mensal válida"); return; }

    setSaving(true);
    const payload = {
      user_id: userId,
      name: name.trim(),
      target_amount: amount,
      current_amount: 0,
      deadline: deadline || null,
      goal_type: goalType,
      monthly_target: monthly,
      priority: goalType === "emergency" ? 1 : 3,
    };
    let { error } = await supabase.from("goals").insert(payload);
    if (error && /goal_type|monthly_target|priority/i.test(error.message)) {
      const fallback = await supabase.from("goals").insert({
        user_id: userId,
        name: name.trim(),
        target_amount: amount,
        current_amount: 0,
        deadline: deadline || null,
      });
      error = fallback.error;
    }

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Meta criada!");
    setName("");
    setTargetAmount("");
    setMonthlyTarget("");
    setGoalType("other");
    setDeadline("");
    setSaving(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Novo cofrinho</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Comece com uma ideia</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {GOAL_TEMPLATES.map((template) => (
                <button
                  key={template.type}
                  type="button"
                  onClick={() => {
                    setName(template.name);
                    setGoalType(template.type);
                    setTargetAmount(template.target);
                    setMonthlyTarget(template.monthly);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:bg-primary/5"
                >
                  <Sparkles className="h-3 w-3 text-primary" /> {template.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Nome do objetivo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Entrada do apartamento" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Valor do sonho</Label>
              <Input type="text" inputMode="decimal" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0,00" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quanto guardar/mês</Label>
              <Input type="text" inputMode="decimal" value={monthlyTarget} onChange={(e) => setMonthlyTarget(e.target.value)} placeholder="0,00" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Prazo (opcional)</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground font-semibold h-11">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar cofrinho"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
