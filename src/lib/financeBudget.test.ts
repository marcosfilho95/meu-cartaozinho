import { describe, expect, it } from "vitest";

import { getMonthlySpendingGoal } from "@/lib/financeBudget";

describe("getMonthlySpendingGoal", () => {
  it("usa a meta mensal global sem somar limites por categoria", () => {
    expect(getMonthlySpendingGoal([
      { category_id: null, limit_amount: 7000 },
      { category_id: "moradia", limit_amount: 2500 },
      { category_id: "alimentacao", limit_amount: 1200 },
    ])).toBe(7000);
  });

  it("mantém a soma dos limites antigos quando ainda não há meta global", () => {
    expect(getMonthlySpendingGoal([
      { category_id: "moradia", limit_amount: 2500 },
      { category_id: "alimentacao", limit_amount: 1200 },
    ])).toBe(3700);
  });

  it("ignora valores inválidos ou negativos no fallback", () => {
    expect(getMonthlySpendingGoal([
      { category_id: "moradia", limit_amount: -500 },
      { category_id: "alimentacao", limit_amount: "800" },
    ])).toBe(800);
  });
});
