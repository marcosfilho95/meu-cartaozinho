import React, { useMemo } from "react";
import { CircleGauge, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { calculateSuggestedContribution } from "@/lib/goalContributions";
import type { FinancialRuleVersion } from "@/lib/financialRules";
import { getGoalIcon } from "./goalVisuals";

type AllocationGoal = {
  id: string;
  name: string;
  goal_type?: string | null;
};

interface GoalAllocationChartProps {
  goals: AllocationGoal[];
  activeRules: FinancialRuleVersion[];
  monthlyIncome: number;
  monthlyAvailable: number;
  referenceLabel: string;
}

const PLAN_COLORS = ["#12664f", "#2a9d8f", "#d4a72c", "#d97745", "#8b5e83"];

export const GoalAllocationChart: React.FC<GoalAllocationChartProps> = ({
  goals,
  activeRules,
  monthlyIncome,
  monthlyAvailable,
  referenceLabel,
}) => {
  const chart = useMemo(() => {
    const plans = goals.map((goal, index) => {
      const rule = activeRules.find((candidate) => candidate.goal_id === goal.id) || null;
      const suggested = calculateSuggestedContribution(rule, { monthlyIncome, monthlyAvailable });
      const share = rule?.value_type === "percentage" && rule.calculation_base === "available_after_priorities"
        ? Math.max(Number(rule.value || 0), 0)
        : monthlyAvailable > 0
          ? Math.max((suggested / monthlyAvailable) * 100, 0)
          : 0;
      return {
        ...goal,
        color: PLAN_COLORS[index % PLAN_COLORS.length],
        share,
        suggested,
        hasRule: Boolean(rule),
      };
    });
    const planned = plans.reduce((sum, plan) => sum + plan.share, 0);
    const scale = planned > 100 ? 100 / planned : 1;
    return {
      plans: plans.map((plan) => ({ ...plan, visualShare: plan.share * scale })),
      planned,
      remaining: Math.max(100 - planned, 0),
      overage: Math.max(planned - 100, 0),
    };
  }, [activeRules, goals, monthlyAvailable, monthlyIncome]);

  return (
    <Card className="overflow-hidden border-0 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CircleGauge className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-base font-bold">Distribuição dos seus planos</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Como 100% do valor disponível está planejado em {referenceLabel}.
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 px-3 py-2 text-left sm:text-right">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Planejado</p>
            <p className="text-lg font-extrabold tabular-nums text-primary">
              {chart.planned.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span className="text-xs font-medium text-muted-foreground">de 100%</span>
            </p>
          </div>
        </div>

        <div>
          <div
            className="flex h-5 w-full overflow-hidden rounded-full border border-border bg-muted"
            role="img"
            aria-label={`${chart.planned.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% distribuídos entre ${goals.length} planos e ${chart.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ainda não distribuídos`}
          >
            {chart.plans.map((plan) => plan.visualShare > 0 && (
              <div
                key={plan.id}
                className="h-full border-r border-background/60 transition-[width] duration-500 last:border-r-0"
                style={{ width: `${plan.visualShare}%`, backgroundColor: plan.color }}
                title={`${plan.name}: ${plan.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
              />
            ))}
            {chart.remaining > 0 && (
              <div
                className="h-full bg-muted-foreground/15"
                style={{ width: `${chart.remaining}%` }}
                title={`Ainda não distribuído: ${chart.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
              />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span className={chart.remaining > 0 ? "font-semibold text-foreground" : "font-semibold text-success"}>
              {chart.remaining > 0
                ? `Ainda faltam ${chart.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% para distribuir`
                : "Distribuição completa"}
            </span>
            <span>100%</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {chart.plans.map((plan) => {
            const GoalIcon = getGoalIcon(plan);
            return (
            <div key={plan.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: plan.color }}>
                  <GoalIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{plan.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {plan.hasRule ? `${formatCurrency(plan.suggested)} sugeridos` : "Meta mensal não definida"}
                  </p>
                </div>
              </div>
              <strong className="shrink-0 text-xs tabular-nums text-primary">
                {plan.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </strong>
            </div>
            );
          })}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-muted-foreground/20" />
              <div>
                <p className="text-xs font-semibold text-foreground">Ainda não distribuído</p>
                <p className="text-[10px] text-muted-foreground">Disponível para novos planos ou ajustes</p>
              </div>
            </div>
            <strong className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {chart.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </strong>
          </div>
        </div>

        {chart.overage > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Suas metas equivalem a {chart.planned.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do disponível. Reduza {chart.overage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% para o planejamento caber em 100%.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
