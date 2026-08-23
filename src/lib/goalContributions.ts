import type { FinancialRuleVersion } from "@/lib/financialRules";

export type GoalContributionMovement = {
  goal_id: string;
  amount: number;
  type: string;
  ref_month?: string | null;
  created_at?: string | null;
};

const asAmount = (value: number | null | undefined) => Number(value) || 0;

export const getContributionMonth = (movement: GoalContributionMovement) =>
  movement.ref_month || movement.created_at?.slice(0, 7) || "";

export const calculateGoalActualsForMonth = (
  movements: GoalContributionMovement[],
  refMonth: string,
) => movements.reduce<Record<string, number>>((totals, movement) => {
  if (getContributionMonth(movement) !== refMonth) return totals;
  const signedAmount = movement.type === "withdraw"
    ? -Math.abs(asAmount(movement.amount))
    : movement.type === "deposit"
      ? Math.abs(asAmount(movement.amount))
      : 0;
  totals[movement.goal_id] = (totals[movement.goal_id] || 0) + signedAmount;
  return totals;
}, {});

export const calculateAvailableForContributions = (
  monthlyAvailable: number,
  alreadyContributed: number,
) => Math.max(asAmount(monthlyAvailable) - asAmount(alreadyContributed), 0);

export const calculateSuggestedContribution = (
  rule: FinancialRuleVersion | null | undefined,
  bases: { monthlyIncome: number; monthlyAvailable: number },
) => {
  if (!rule) return 0;
  const value = Math.max(asAmount(rule.value), 0);
  if (rule.value_type === "fixed") return value;
  const base = rule.calculation_base === "total_income"
    ? Math.max(asAmount(bases.monthlyIncome), 0)
    : Math.max(asAmount(bases.monthlyAvailable), 0);
  return Math.round(base * value) / 100;
};

export const calculateMonthlyGoalAchievement = (suggested: number, actual: number) =>
  suggested > 0 ? (actual / suggested) * 100 : actual > 0 ? 100 : 0;
