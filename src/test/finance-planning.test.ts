import { describe, expect, it } from "vitest";
import {
  buildCategoryMovements,
  getGoalMonthlyRequirement,
  getLastClosedMonthKey,
  getReductionOpportunities,
  getSavingsPlan,
  getTransactionsForMonth,
} from "@/lib/financePlanning";
import type { FinanceTx } from "@/lib/financeShared";

const transaction = (
  id: string,
  month: string,
  amount: number,
  categoryId: string,
  categoryName: string,
): FinanceTx => ({
  id,
  amount,
  type: "expense",
  status: "paid",
  source: categoryName,
  notes: null,
  payment_method: "credit",
  transaction_date: `${month}-15`,
  due_date: null,
  account_id: "account",
  category_id: categoryId,
  categories: { id: categoryId, name: categoryName, color: "#123456", parent_id: null },
  accounts: null,
});

describe("financial planning", () => {
  it("uses the previous calendar month as the default closed month", () => {
    expect(getLastClosedMonthKey(new Date("2026-07-15T12:00:00"))).toBe("2026-06");
    expect(getLastClosedMonthKey(new Date("2026-01-10T12:00:00"))).toBe("2025-12");
  });

  it("filters exact closed-month transactions without pulling the current month", () => {
    const rows = [
      transaction("jun", "2026-06", 100, "food", "Mercado"),
      transaction("jul", "2026-07", 200, "food", "Mercado"),
    ];
    expect(getTransactionsForMonth(rows, "2026-06").map((row) => row.id)).toEqual(["jun"]);
  });

  it("combines the 20% savings baseline with goal requirements", () => {
    const plan = getSavingsPlan({
      income: 10_000,
      expenses: 9_000,
      refMonth: "2026-06",
      goals: [{ name: "Apartamento", target_amount: 100_000, current_amount: 10_000, monthly_target: 2_500 }],
    });
    expect(plan.positiveSurplus).toBe(1_000);
    expect(plan.monthlyTarget).toBe(2_500);
    expect(plan.gap).toBe(1_500);
    expect(plan.status).toBe("critical");
  });

  it("derives a monthly requirement from a deadline when no target was set", () => {
    expect(getGoalMonthlyRequirement({
      name: "Viagem",
      target_amount: 12_000,
      current_amount: 6_000,
      deadline: "2026-12-20",
    }, "2026-06")).toBe(1_000);
  });

  it("finds category increases, decreases and practical reduction opportunities", () => {
    const current = [
      transaction("d1", "2026-06", 600, "delivery", "Delivery"),
      transaction("m1", "2026-06", 700, "market", "Mercado"),
    ];
    const previous = [
      transaction("d0", "2026-05", 200, "delivery", "Delivery"),
      transaction("m0", "2026-05", 900, "market", "Mercado"),
    ];
    const movements = buildCategoryMovements(current, previous);
    expect(movements.find((item) => item.id === "delivery")).toMatchObject({ delta: 400, percentChange: 200 });
    expect(movements.find((item) => item.id === "market")?.delta).toBe(-200);
    expect(getReductionOpportunities(movements, 300)[0]).toMatchObject({ id: "delivery", potential: 200 });
  });

  it("does not recommend cuts in essential categories", () => {
    const movements = buildCategoryMovements(
      [transaction("health", "2026-06", 800, "health", "Saúde")],
      [transaction("health-before", "2026-05", 300, "health", "Saúde")],
    );

    expect(getReductionOpportunities(movements, 500)).toEqual([]);
  });
});
