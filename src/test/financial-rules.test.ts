import { describe, expect, it } from "vitest";

import { buildFinancialPlan, resolveFinancialRules, type FinancialRuleVersion } from "@/lib/financialRules";

const version = (overrides: Partial<FinancialRuleVersion>): FinancialRuleVersion => ({
  id: "id",
  user_id: "user",
  rule_key: "spending_limit",
  rule_type: "spending_limit",
  effective_month: "2026-08",
  value_type: "fixed",
  value: 7000,
  calculation_base: "total_income",
  goal_id: null,
  priority: 0,
  created_at: "2026-08-01T12:00:00Z",
  ...overrides,
});

describe("financial rules by competence", () => {
  it("preserva agosto quando uma nova versão começa em setembro", () => {
    const rows = [version({ id: "aug" }), version({ id: "sep", effective_month: "2026-09", value: 10000 })];
    expect(resolveFinancialRules(rows, "2026-08")[0].value).toBe(7000);
    expect(resolveFinancialRules(rows, "2026-09")[0].value).toBe(10000);
  });

  it("calcula percentuais sobre a renda do mês", () => {
    const travel = version({ rule_key: "goal:travel", rule_type: "travel", goal_id: "travel", value_type: "percentage", value: 5 });
    expect(buildFinancialPlan([travel], "2026-08", 14000).goalAmounts.get("travel")).toBe(700);
    expect(buildFinancialPlan([travel], "2026-09", 18000).goalAmounts.get("travel")).toBe(900);
  });

  it("calcula percentuais sobre o restante após o limite de despesas", () => {
    const travel = version({ rule_key: "goal:travel", rule_type: "travel", goal_id: "travel", value_type: "percentage", value: 10, calculation_base: "available_after_priorities" });
    const plan = buildFinancialPlan([version({}), travel], "2026-08", 14000);
    expect(plan.availableAfterSpendingLimit).toBe(7000);
    expect(plan.goalAmounts.get("travel")).toBe(700);
  });

  it("desconta metas prioritárias antes das regras de prioridade seguinte", () => {
    const emergency = version({ rule_key: "goal:emergency", goal_id: "emergency", value_type: "percentage", value: 10, calculation_base: "available_after_priorities", priority: 1 });
    const travel = version({ rule_key: "goal:travel", goal_id: "travel", value_type: "percentage", value: 10, calculation_base: "available_after_priorities", priority: 100 });
    const plan = buildFinancialPlan([version({}), emergency, travel], "2026-08", 14000);
    expect(plan.goalAmounts.get("emergency")).toBe(700);
    expect(plan.goalAmounts.get("travel")).toBe(630);
  });
});
