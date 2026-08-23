import { describe, expect, it } from "vitest";

import {
  calculateContributionStats,
  calculateGoalTarget,
  getEffectiveAnnualRate,
  projectGoalCompletion,
  resolveGoalProjectionVersions,
  type GoalProjectionVersion,
} from "@/lib/goalProjections";

const version = (overrides: Partial<GoalProjectionVersion> = {}): GoalProjectionVersion => ({
  id: "version-1",
  user_id: "user-1",
  goal_id: "goal-1",
  effective_month: "2026-08",
  target_mode: "fixed",
  target_amount: 60_000,
  emergency_months: null,
  yield_type: "none",
  yield_rate_percent: 0,
  created_at: "2026-08-01T10:00:00Z",
  ...overrides,
});

describe("goal projections", () => {
  it("preserves the version active in each competence", () => {
    const versions = [
      version({ id: "aug", effective_month: "2026-08", target_amount: 60_000 }),
      version({ id: "sep", effective_month: "2026-09", target_amount: 80_000 }),
    ];
    expect(resolveGoalProjectionVersions(versions, "2026-08").get("goal-1")?.target_amount).toBe(60_000);
    expect(resolveGoalProjectionVersions(versions, "2026-09").get("goal-1")?.target_amount).toBe(80_000);
  });

  it("averages realized contributions including months without a deposit", () => {
    const stats = calculateContributionStats([
      { goal_id: "goal-1", amount: 900, type: "deposit", ref_month: "2026-06" },
      { goal_id: "goal-1", amount: 600, type: "deposit", ref_month: "2026-08" },
    ], "goal-1", "2026-08");
    expect(stats.monthsObserved).toBe(3);
    expect(stats.averageMonthly).toBe(500);
  });

  it("projects a later completion without yield and an earlier one with yield", () => {
    const withoutYield = projectGoalCompletion({ currentAmount: 15_000, targetAmount: 60_000, monthlyContribution: 1_050, refMonth: "2026-08" });
    const withYield = projectGoalCompletion({ currentAmount: 15_000, targetAmount: 60_000, monthlyContribution: 1_050, annualRate: 14, refMonth: "2026-08" });
    expect(withoutYield.months).toBe(43);
    expect(withYield.months).not.toBeNull();
    expect(withYield.months!).toBeLessThan(withoutYield.months!);
  });

  it("does not create a completion forecast for an open-ended destination", () => {
    expect(projectGoalCompletion({
      currentAmount: 600,
      targetAmount: 0,
      monthlyContribution: 100,
      refMonth: "2026-08",
    })).toEqual({ months: null, completionMonth: null, projectedBalance: 600 });
  });

  it("calculates emergency target and indexed rates without changing real balance", () => {
    expect(calculateGoalTarget(10_000, version({ target_mode: "emergency_months", emergency_months: 9 }), 7_000)).toBe(63_000);
    expect(getEffectiveAnnualRate(version({ yield_type: "cdi", yield_rate_percent: 102 }), [{ rate_key: "cdi", annual_rate: 13.9, as_of_date: "2026-08-23", source: "test", is_approximation: true, updated_at: "2026-08-23T10:00:00Z" }])).toBeCloseTo(14.178);
  });
});
