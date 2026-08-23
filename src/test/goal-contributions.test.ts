import { describe, expect, it } from "vitest";

import {
  calculateAvailableForContributions,
  calculateGoalActualsForMonth,
  calculateMonthlyGoalAchievement,
  calculateSuggestedContribution,
} from "@/lib/goalContributions";
import type { FinancialRuleVersion } from "@/lib/financialRules";

const rule = (overrides: Partial<FinancialRuleVersion> = {}): FinancialRuleVersion => ({
  id: "rule-1",
  user_id: "user-1",
  rule_key: "goal:goal-1",
  rule_type: "emergency",
  effective_month: "2026-08",
  value_type: "percentage",
  value: 15,
  calculation_base: "available_after_priorities",
  goal_id: "goal-1",
  priority: 1,
  created_at: "2026-08-01T12:00:00Z",
  ...overrides,
});

describe("goal contributions", () => {
  it("uses the selected competence instead of the creation date", () => {
    const actuals = calculateGoalActualsForMonth([
      { goal_id: "goal-1", amount: 900, type: "deposit", ref_month: "2026-08", created_at: "2026-09-02T10:00:00Z" },
      { goal_id: "goal-1", amount: 100, type: "withdraw", ref_month: "2026-08", created_at: "2026-09-03T10:00:00Z" },
      { goal_id: "goal-1", amount: 500, type: "deposit", ref_month: "2026-09", created_at: "2026-09-03T10:00:00Z" },
    ], "2026-08");

    expect(actuals).toEqual({ "goal-1": 800 });
  });

  it("calculates the suggestion without turning it into an actual deposit", () => {
    expect(calculateSuggestedContribution(rule(), { monthlyIncome: 14_000, monthlyAvailable: 7_487.95 })).toBe(1_123.19);
    expect(calculateSuggestedContribution(rule({ calculation_base: "total_income" }), { monthlyIncome: 14_000, monthlyAvailable: 7_487.95 })).toBe(2_100);
  });

  it("uses the same monthly available base for display and validation", () => {
    expect(calculateAvailableForContributions(7_487.95, 900)).toBeCloseTo(6_587.95);
    expect(calculateMonthlyGoalAchievement(1_123.19, 900)).toBeCloseTo(80.13, 1);
  });
});
