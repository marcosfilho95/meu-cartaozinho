import React, { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createFinancialRuleVersion, getGoalPercentageTotal, type FinancialRuleBase, type FinancialRuleValueType, type FinancialRuleVersion } from "@/lib/financialRules";
import { monthTitle } from "@/lib/financeInsights";

interface EditableGoal { id: string; name: string; goal_type?: string; priority?: number }
interface AddGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  refMonth: string;
  onCreated: () => void;
  goal?: EditableGoal | null;
  currentRule?: FinancialRuleVersion | null;
  financialRules?: FinancialRuleVersion[];
}

const GOAL_TYPES = [
  ["emergency", "Reserva de emergência"], ["savings", "Poupança"],
  ["investment", "Investimentos"], ["pgbl", "PGBL"], ["family", "Filhos e família"],
  ["travel", "Viagem e experiências"], ["car", "Carro"], ["home", "Casa ou apartamento"],
  ["donation", "Doações"], ["education", "Educação"], ["retirement", "Aposentadoria"],
  ["custom", "Objetivo personalizado"],
] as const;

const GOAL_TEMPLATES = [
  { label: "Emergência", name: "Reserva de emergência", type: "emergency", target: "30000", allocation: "10" },
  { label: "Investir", name: "Investimentos", type: "investment", target: "50000", allocation: "10" },
  { label: "Viagem", name: "Viagem dos sonhos", type: "travel", target: "12000", allocation: "5" },
  { label: "Carro", name: "Compra do carro", type: "car", target: "50000", allocation: "5" },
  { label: "Apartamento", name: "Entrada do apartamento", type: "home", target: "100000", allocation: "10" },
] as const;

const parseNumber = (value: string) => Number(value.trim().replace(/R\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));

export const AddGoalDialog: React.FC<AddGoalDialogProps> = ({ open, onOpenChange, userId, refMonth, onCreated, goal = null, currentRule = null, financialRules = [] }) => {
  const editing = Boolean(goal);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [allocation, setAllocation] = useState("");
  const [valueType, setValueType] = useState<FinancialRuleValueType>("percentage");
  const [calculationBase, setCalculationBase] = useState<FinancialRuleBase>("available_after_priorities");
  const [goalType, setGoalType] = useState("custom");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(goal?.name || "");
    setGoalType(goal?.goal_type || "custom");
    setTargetAmount("");
    setDeadline("");
    setValueType(currentRule?.value_type || "percentage");
    setCalculationBase(currentRule?.calculation_base || "available_after_priorities");
    setAllocation(currentRule ? String(currentRule.value).replace(".", ",") : "");
  }, [currentRule, goal, open]);

  const handleSave = async () => {
    if (!editing && !name.trim()) return void toast.error("Informe o nome do plano.");
    const target = editing ? 0 : parseNumber(targetAmount);
    if (!editing && (!target || target <= 0)) return void toast.error("Informe o valor total do objetivo.");
    const ruleValue = parseNumber(allocation);
    if (!Number.isFinite(ruleValue) || ruleValue < 0) return void toast.error("Informe uma regra mensal válida.");
    if (valueType === "percentage" && ruleValue > 100) return void toast.error("O percentual não pode passar de 100%.");
    if (valueType === "percentage") {
      const totalAfterChange = getGoalPercentageTotal(financialRules, refMonth, goal?.id) + ruleValue;
      if (totalAfterChange > 100.00001) return void toast.error(`Os planos somariam ${totalAfterChange.toFixed(1)}%. O limite é 100%.`);
    }

    setSaving(true);
    let createdGoalId: string | null = null;
    try {
      let goalId = goal?.id;
      let type = goal?.goal_type || goalType;
      const priority = goal?.priority ?? (type === "emergency" ? 1 : 100);
      if (!goalId) {
        const { data, error } = await supabase.from("goals").insert({ user_id: userId, name: name.trim(), target_amount: target, current_amount: 0, deadline: deadline || null, goal_type: goalType, monthly_target: valueType === "fixed" ? ruleValue : 0, priority }).select("id").single();
        if (error) throw error;
        goalId = data.id;
        createdGoalId = data.id;
        type = goalType;
      }
      await createFinancialRuleVersion({ user_id: userId, rule_key: `goal:${goalId}`, rule_type: type, effective_month: refMonth, value_type: valueType, value: ruleValue, calculation_base: valueType === "fixed" ? "total_income" : calculationBase, goal_id: goalId, priority });
      toast.success(editing ? `Regra aplicada em ${monthTitle(refMonth)} e nos meses seguintes.` : `Plano criado e aplicado em ${monthTitle(refMonth)}!`);
      onOpenChange(false);
      onCreated();
    } catch (error: unknown) {
      if (createdGoalId) await supabase.from("goals").delete().eq("id", createdGoalId).eq("user_id", userId);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o plano.");
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md rounded-2xl"><DialogHeader><DialogTitle className="font-heading">{editing ? `Regra de ${goal?.name}` : "Novo plano"}</DialogTitle></DialogHeader><div className="space-y-4">
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">Esta configuração já vale em <strong className="text-foreground">{monthTitle(refMonth)}</strong>: o valor destinado aparece nesta competência e a regra continua nos meses seguintes. O histórico anterior não será alterado.</div>
    {!editing && <>
      <div><Label className="text-xs text-muted-foreground">Comece com uma ideia</Label><div className="mt-1.5 flex flex-wrap gap-2">{GOAL_TEMPLATES.map((template) => <button key={template.label} type="button" onClick={() => { setName(template.name); setGoalType(template.type); setTargetAmount(template.target); setAllocation(template.allocation); setValueType("percentage"); }} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:bg-primary/5"><Sparkles className="h-3 w-3 text-primary" /> {template.label}</button>)}</div></div>
      <div><Label className="text-xs text-muted-foreground">Nome do objetivo</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Entrada do apartamento" className="mt-1" /></div>
      <div><Label className="text-xs text-muted-foreground">Tipo</Label><Select value={goalType} onValueChange={setGoalType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{GOAL_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs text-muted-foreground">Valor total do objetivo</Label><Input inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="Ex.: 10.000,00" className="mt-1" /></div><div><Label className="text-xs text-muted-foreground">Prazo (opcional)</Label><Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1" /></div></div>
    </>}
    <div><Label className="text-xs text-muted-foreground">Como calcular a contribuição mensal?</Label><Select value={valueType} onValueChange={(value) => setValueType(value as FinancialRuleValueType)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentual (%)</SelectItem><SelectItem value="fixed">Valor fixo mensal</SelectItem></SelectContent></Select></div>
    <div><Label className="text-xs text-muted-foreground">{valueType === "percentage" ? "Percentual" : "Valor mensal"}</Label><div className="relative mt-1"><Input inputMode="decimal" value={allocation} onChange={(event) => setAllocation(event.target.value)} placeholder={valueType === "percentage" ? "Ex.: 5" : "Ex.: 500,00"} className={valueType === "percentage" ? "pr-9" : "pl-10"} />{valueType === "percentage" ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span> : <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>}</div></div>
    {valueType === "percentage" && <div><Label className="text-xs text-muted-foreground">Base do percentual</Label><Select value={calculationBase} onValueChange={(value) => setCalculationBase(value as FinancialRuleBase)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="available_after_priorities">Valor disponível após o limite de despesas</SelectItem><SelectItem value="total_income">Renda total do mês</SelectItem></SelectContent></Select><p className="mt-1 text-[11px] text-muted-foreground">O destino em reais é calculado imediatamente para {monthTitle(refMonth)} e será recalculado conforme os valores de cada mês.</p></div>}
    <Button onClick={handleSave} disabled={saving} className="h-11 w-full font-semibold">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : editing ? "Salvar nova versão" : "Criar plano"}</Button>
  </div></DialogContent></Dialog>;
};
