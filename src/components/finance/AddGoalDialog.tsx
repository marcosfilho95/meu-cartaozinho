import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AddGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}

export const AddGoalDialog: React.FC<AddGoalDialogProps> = ({ open, onOpenChange, userId, onCreated }) => {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome da meta"); return; }
    const amount = parseFloat(targetAmount.replace(",", "."));
    if (!amount || amount <= 0) { toast.error("Informe um valor alvo válido"); return; }

    setSaving(true);
    const { error } = await supabase.from("goals").insert({
      user_id: userId,
      name: name.trim(),
      target_amount: amount,
      current_amount: 0,
      deadline: deadline || null,
    });

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Meta criada!");
    setName("");
    setTargetAmount("");
    setDeadline("");
    setSaving(false);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Nova Meta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Nome da meta</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comprar carro, Reserva de emergência..." className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor alvo (R$)</Label>
            <Input type="text" inputMode="decimal" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0,00" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Prazo (opcional)</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground font-semibold h-11">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar meta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
