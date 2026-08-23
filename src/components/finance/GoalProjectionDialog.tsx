import React, { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
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
  type GoalYieldType,
  type ReferenceRate,
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
  referenceRates: ReferenceRate[];
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
  referenceRates,
  onSaved,
}) => {
  const isEmergency = goal?.goal_type === "emergency";
  const [targetMode, setTargetMode] = useState<GoalTargetMode>("fixed");
  const [targetAmount, setTargetAmount] = useState("");
  const [emergencyMonths, setEmergencyMonths] = useState("6");
  const [yieldType, setYieldType] = useState<GoalYieldType>("none");
  const [yieldRate, setYieldRate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !goal) return;
    setTargetMode(currentVersion?.target_mode || "fixed");
    setTargetAmount(String(currentVersion?.target_amount || goal.target_amount || "").replace(".", ","));
    setEmergencyMonths(String(currentVersion?.emergency_months || 6).replace(".", ","));
    setYieldType(currentVersion?.yield_type || "none");
    setYieldRate(currentVersion?.yield_type === "none" ? "" : String(currentVersion?.yield_rate_percent || 100).replace(".", ","));
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

  const selectedReference = referenceRates.find((rate) => rate.rate_key === yieldType);
  const selectedReferenceIsStale = selectedReference
    ? Date.now() - new Date(selectedReference.updated_at).getTime() > 7 * 24 * 60 * 60 * 1000
    : false;

  const save = async () => {
    if (!goal) return;
    const fixedTarget = parseNumber(targetAmount);
    const months = parseNumber(emergencyMonths);
    const rate = yieldType === "none" ? 0 : parseNumber(yieldRate);
    if (targetMode === "fixed" && (!fixedTarget || fixedTarget <= 0)) return void toast.error("Informe a meta final do plano.");
    if (targetMode === "emergency_months" && (!months || months <= 0)) return void toast.error("Informe quantos meses deseja cobrir.");
    if (yieldType !== "none" && (!Number.isFinite(rate) || rate <= 0)) return void toast.error("Informe a taxa ou o percentual do indexador.");

    setSaving(true);
    try {
      await createGoalProjectionVersion({
        user_id: userId,
        goal_id: goal.id,
        effective_month: refMonth,
        target_mode: targetMode,
        target_amount: targetMode === "fixed" ? fixedTarget : calculatedTarget,
        emergency_months: targetMode === "emergency_months" ? months : null,
        yield_type: yieldType,
        yield_rate_percent: rate,
      });
      const { error } = await supabase
        .from("goals")
        .update({ target_amount: calculatedTarget })
        .eq("id", goal.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(`Meta final e projeção atualizadas para ${monthTitle(refMonth)}.`);
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
          <DialogTitle className="font-heading">Meta final e rendimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            Esta versão começa em <strong className="text-foreground">{monthTitle(refMonth)}</strong>. O saldo real não muda: estas opções servem apenas para a meta e para projeções.
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

          <div className="border-t border-border pt-4">
            <Label className="text-xs text-muted-foreground">Rentabilidade estimada</Label>
            <Select value={yieldType} onValueChange={(value) => { setYieldType(value as GoalYieldType); setYieldRate(value === "none" ? "" : value === "manual" ? "" : "100"); }}>
              <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem rendimento</SelectItem>
                <SelectItem value="cdi">Percentual do CDI</SelectItem>
                <SelectItem value="selic">Percentual da Selic</SelectItem>
                <SelectItem value="manual">Taxa anual manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {yieldType !== "none" && (
            <div>
              <Label className="text-xs text-muted-foreground">
                {yieldType === "manual" ? "Taxa anual" : `Percentual do ${yieldType.toUpperCase()}`}
              </Label>
              <div className="relative mt-1">
                <Input inputMode="decimal" value={yieldRate} onChange={(event) => setYieldRate(event.target.value)} placeholder={yieldType === "manual" ? "Ex.: 12" : "Ex.: 102"} className="h-11 pr-9" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              {selectedReference && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Referência atual: {selectedReference.annual_rate.toLocaleString("pt-BR")}% a.a. · {selectedReference.source} · {new Date(`${selectedReference.as_of_date}T12:00:00`).toLocaleDateString("pt-BR")}
                  {selectedReferenceIsStale && <span className="mt-1 block font-semibold text-amber-700">Última taxa válida salva; a atualização automática pode estar temporariamente indisponível.</span>}
                </p>
              )}
            </div>
          )}

          <Button onClick={save} disabled={saving} className="h-11 w-full gap-2 font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Salvar nova versão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
