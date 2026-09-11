import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { monthTitle } from "@/lib/financeInsights";
import {
  calculateGoalTarget,
  createGoalProjectionVersion,
  type GoalProjectionVersion,
  type GoalTargetMode,
} from "@/lib/goalProjections";

type ProjectionGoal = {
  id: string;
  name: string;
  goal_type?: string;
  target_amount: number;
};

interface GoalProjectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  refMonth: string;
  goal: ProjectionGoal | null;
  currentVersion?: GoalProjectionVersion | null;
  averageMonthlyExpenses: number;
  onSaved: () => void;
}

const parseNumber = (value: string) => Number(
  value.trim().replace(/R\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."),
);

export const GoalProjectionDialog: React.FC<GoalProjectionDialogProps> = ({
  open,
  onOpenChange,
  userId,
  refMonth,
  goal,
  currentVersion = null,
  averageMonthlyExpenses,
  onSaved,
}) => {
  const isEmergency = goal?.goal_type === "emergency";
  const [targetMode, setTargetMode] = useState<GoalTargetMode>("fixed");
  const [targetAmount, setTargetAmount] = useState("");
  const [emergencyMonths, setEmergencyMonths] = useState("6");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !goal) return;
    setTargetMode(currentVersion?.target_mode || "fixed");
    setTargetAmount(String(currentVersion?.target_amount || goal.target_amount || "").replace(".", ","));
    setEmergencyMonths(String(currentVersion?.emergency_months || 6).replace(".", ","));
  }, [currentVersion, goal, open]);

  const calculatedTarget = useMemo(() => calculateGoalTarget(
    parseNumber(targetAmount) || Number(goal?.target_amount || 0),
    targetMode === "emergency_months" ? {
      ...(currentVersion || {} as GoalProjectionVersion),
      target_mode: "emergency_months",
      emergency_months: parseNumber(emergencyMonths) || 0,
    } : null,
    averageMonthlyExpenses,
  ), [averageMonthlyExpenses, currentVersion, emergencyMonths, goal?.target_amount, targetAmount, targetMode]);

  const save = async () => {
    if (!goal) return;
    const fixedTarget = parseNumber(targetAmount);
    const months = parseNumber(emergencyMonths);
    if (targetMode === "fixed" && (!fixedTarget || fixedTarget <= 0)) return void toast.error("Informe a meta final do plano.");
    if (targetMode === "emergency_months" && (!months || months <= 0)) return void toast.error("Informe quantos meses deseja cobrir.");

    setSaving(true);
    try {
      await createGoalProjectionVersion({
        user_id: userId,
        goal_id: goal.id,
        effective_month: refMonth,
        target_mode: targetMode,
        target_amount: targetMode === "fixed" ? fixedTarget : calculatedTarget,
        emergency_months: targetMode === "emergency_months" ? months : null,
        yield_type: "none",
        yield_rate_percent: 0,
      });
      const { error } = await supabase
        .from("goals")
        .update({ target_amount: calculatedTarget })
        .eq("id", goal.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(`Meta final atualizada para ${monthTitle(refMonth)}.`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a projeção.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Meta final</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            Esta meta começa em <strong className="text-foreground">{monthTitle(refMonth)}</strong>. O valor já guardado não muda.
          </div>

          {isEmergency && (
            <div>
              <Label className="text-xs text-muted-foreground">Como definir a reserva?</Label>
              <Select value={targetMode} onValueChange={(value) => setTargetMode(value as GoalTargetMode)}>
                <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Valor final fixo</SelectItem>
                  <SelectItem value="emergency_months">Meses do custo de vida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {targetMode === "emergency_months" && isEmergency ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quantos meses de custo deseja cobrir?</Label>
              <Input inputMode="decimal" value={emergencyMonths} onChange={(event) => setEmergencyMonths(event.target.value)} placeholder="Ex.: 9" className="h-11" />
              <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                Custo médio: <strong className="text-foreground">{formatCurrency(averageMonthlyExpenses)}/mês</strong><br />
                Meta calculada: <strong className="text-primary">{formatCurrency(calculatedTarget)}</strong>
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground">Meta final do plano</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="Ex.: 60.000,00" className="h-11 pl-10" />
              </div>
            </div>
          )}

          <Button onClick={save} disabled={saving} className="h-11 w-full gap-2 font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            Salvar meta final
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
