import { untypedSupabase } from "@/lib/supabaseUntyped";

export type FinancialRuleValueType = "fixed" | "percentage";
export type FinancialRuleBase = "total_income" | "available_after_priorities";

export type FinancialRuleVersion = {
  id: string;
  user_id: string;
  rule_key: string;
  rule_type: string;
  effective_month: string;
  value_type: FinancialRuleValueType;
  value: number;
  calculation_base: FinancialRuleBase;
  goal_id: string | null;
  priority: number;
  created_at: string;
};

export type FinancialRuleDraft = Omit<FinancialRuleVersion, "id" | "created_at" | "value"> & {
  value: number;
};

export const resolveFinancialRules = (versions: FinancialRuleVersion[], refMonth: string) => {
  const latest = new Map<string, FinancialRuleVersion>();
  [...versions]
    .filter((version) => version.effective_month <= refMonth)
    .sort((left, right) =>
      right.effective_month.localeCompare(left.effective_month) ||
      right.created_at.localeCompare(left.created_at),
    )
    .forEach((version) => {
      if (!latest.has(version.rule_key)) latest.set(version.rule_key, version);
    });
  return [...latest.values()].sort((left, right) => left.priority - right.priority);
};

export const calculateAvailablePercentageAmount = (available: number, percentage: number) =>
  Math.round(Math.max(available, 0) * Math.max(percentage, 0)) / 100;

export const getGoalPercentageTotal = (
  versions: FinancialRuleVersion[],
  refMonth: string,
  excludedGoalId?: string,
) => resolveFinancialRules(versions, refMonth)
  .filter((rule) => rule.goal_id && rule.goal_id !== excludedGoalId && rule.value_type === "percentage")
  .reduce((total, rule) => total + Number(rule.value || 0), 0);

export const calculateRuleAmount = (
  rule: FinancialRuleVersion,
  income: number,
  spendingLimit: number,
  availableAfterPriorities = Math.max(income - spendingLimit, 0),
) => {
  if (rule.value_type === "fixed") return Math.max(Number(rule.value || 0), 0);
  const base = rule.calculation_base === "total_income"
    ? Math.max(income, 0)
    : Math.max(availableAfterPriorities, 0);
  return calculateAvailablePercentageAmount(base, Number(rule.value || 0));
};

export const buildFinancialPlan = (
  versions: FinancialRuleVersion[],
  refMonth: string,
  income: number,
  legacySpendingLimit = 0,
) => {
  const rules = resolveFinancialRules(versions, refMonth);
  const spendingRule = rules.find((rule) => rule.rule_key === "spending_limit");
  const spendingLimit = spendingRule
    ? calculateRuleAmount(spendingRule, income, 0)
    : Math.max(legacySpendingLimit, 0);
  const goalAmounts = new Map<string, number>();
  const goalRules = rules.filter((rule) => rule.goal_id);
  let availableAfterPriorities = Math.max(income - spendingLimit, 0);
  const priorities = [...new Set(goalRules.map((rule) => rule.priority))].sort((left, right) => left - right);
  priorities.forEach((priority) => {
    const priorityRules = goalRules.filter((rule) => rule.priority === priority);
    let allocatedAtPriority = 0;
    priorityRules.forEach((rule) => {
      const amount = calculateRuleAmount(rule, income, spendingLimit, availableAfterPriorities);
      goalAmounts.set(rule.goal_id!, amount);
      allocatedAtPriority += amount;
    });
    availableAfterPriorities = Math.max(availableAfterPriorities - allocatedAtPriority, 0);
  });

  return {
    rules,
    spendingRule: spendingRule || null,
    spendingLimit,
    availableAfterSpendingLimit: Math.max(income - spendingLimit, 0),
    availableAfterPriorities,
    goalAmounts,
    plannedForGoals: [...goalAmounts.values()].reduce((sum, amount) => sum + amount, 0),
  };
};

export const fetchFinancialRuleVersions = async (userId: string, refMonth: string) => {
  const { data, error } = await untypedSupabase
    .from("financial_rule_versions")
    .select("id, user_id, rule_key, rule_type, effective_month, value_type, value, calculation_base, goal_id, priority, created_at")
    .eq("user_id", userId)
    .lte("effective_month", refMonth)
    .order("effective_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []) as FinancialRuleVersion[];
};

export const createFinancialRuleVersion = async (draft: FinancialRuleDraft) => {
  const { error } = await untypedSupabase.from("financial_rule_versions").insert(draft);
  if (error) throw error;
};
