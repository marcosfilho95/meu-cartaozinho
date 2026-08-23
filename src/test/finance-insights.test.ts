import { describe, expect, it } from "vitest";

import {
  buildInsights,
  compareMonths,
  getAnalysisMonthKeys,
  groupSmallSlices,
  projectGoal,
  summarizeMonth,
  summarizePeriod,
  toCents,
} from "@/lib/financeInsights";
import type { FinanceTx } from "@/lib/financeShared";

const tx = (overrides: Partial<FinanceTx>): FinanceTx => ({
  id: Math.random().toString(36),
  amount: 0,
  type: "expense",
  status: "paid",
  transaction_date: "2026-08-01",
  account_id: "account-1",
  category_id: null,
  ...overrides,
});

describe("financeInsights", () => {
  it("converte valores monetários para centavos sem acumular ponto flutuante", () => {
    expect(toCents(10.1 + 0.2)).toBe(1030);
    expect(toCents("19.99")).toBe(1999);
  });

  it("resume receitas, despesas, fixos, variáveis e taxas do mês", () => {
    const summary = summarizeMonth([
      tx({ id: "income", type: "income", amount: 5000 }),
      tx({ id: "rent", amount: 1500, recurrence_id: "rec-1", categories: { id: "c1", name: "Aluguel", color: null, parent_id: null } }),
      tx({ id: "market", amount: 1000, categories: { id: "c2", name: "Mercado", color: null, parent_id: null } }),
      tx({ id: "transfer", type: "transfer", amount: 900 }),
      tx({ id: "canceled", amount: 300, status: "canceled" }),
    ], "2026-08");

    expect(summary.income).toBe(5000);
    expect(summary.expenses).toBe(2500);
    expect(summary.fixedExpenses).toBe(1500);
    expect(summary.variableExpenses).toBe(1000);
    expect(summary.result).toBe(2500);
    expect(summary.committedRate).toBe(50);
    expect(summary.savingsRate).toBe(50);
  });

  it("usa competence_month como referência quando disponível", () => {
    const summary = summarizeMonth([
      tx({ amount: 900, transaction_date: "2026-07-28", competence_month: "2026-08" }),
    ], "2026-08");
    expect(summary.expenses).toBe(900);
  });

  it("compara o mês atual com o anterior e calcula média histórica", () => {
    const comparison = compareMonths([
      tx({ id: "jul", amount: 1000, transaction_date: "2026-07-10" }),
      tx({ id: "jun", amount: 500, transaction_date: "2026-06-10" }),
      tx({ id: "aug", amount: 1200 }),
    ], "2026-08");
    expect(comparison.expensesDelta).toBe(200);
    expect(comparison.expensesDeltaPct).toBe(20);
    expect(comparison.averageExpenses).toBe(750);
    expect(comparison.monthsWithData).toBe(2);
  });

  it("monta os períodos de análise até o mês de referência", () => {
    const transactions = [
      tx({ id: "first", transaction_date: "2025-11-10" }),
      tx({ id: "future", transaction_date: "2026-09-10" }),
    ];
    expect(getAnalysisMonthKeys(transactions, "2026-08", "month")).toEqual(["2026-08"]);
    expect(getAnalysisMonthKeys(transactions, "2026-08", "semester")).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
    expect(getAnalysisMonthKeys(transactions, "2026-08", "year")).toHaveLength(12);
    expect(getAnalysisMonthKeys(transactions, "2026-08", "all")[0]).toBe("2025-11");
    expect(getAnalysisMonthKeys(transactions, "2026-08", "all").at(-1)).toBe("2026-08");
  });

  it("resume o período preservando o resultado negativo", () => {
    const summary = summarizePeriod([
      tx({ id: "income", type: "income", amount: 1000, transaction_date: "2026-07-10" }),
      tx({ id: "expense-jul", amount: 1400, transaction_date: "2026-07-10" }),
      tx({ id: "expense-aug", amount: 600, transaction_date: "2026-08-10" }),
    ], ["2026-07", "2026-08"]);
    expect(summary.income).toBe(1000);
    expect(summary.expenses).toBe(2000);
    expect(summary.result).toBe(-1000);
    expect(summary.averageResult).toBe(-500);
  });

  it("agrupa categorias pequenas em Outros", () => {
    const grouped = groupSmallSlices([
      { name: "Moradia", value: 700, color: "#1" },
      { name: "Mercado", value: 250, color: "#2" },
      { name: "Taxa", value: 20, color: "#3" },
      { name: "Café", value: 30, color: "#4" },
    ], { maxItems: 3, minPercentage: 5 });
    expect(grouped.map((item) => item.name)).toEqual(["Moradia", "Mercado", "Outros"]);
    expect(grouped.find((item) => item.name === "Outros")?.value).toBe(50);
  });

  it("projeta a conclusão de um plano com reserva mensal", () => {
    const projection = projectGoal({ id: "trip", name: "Viagem", target_amount: 5000, current_amount: 2000 }, 500, "2026-08");
    expect(projection.progress).toBe(40);
    expect(projection.monthsToFinish).toBe(6);
    expect(projection.estimatedMonth).toBe("2027-02");
  });

  it("mantém destinos contínuos sem inventar meta final ou previsão", () => {
    const projection = projectGoal({ id: "donation", name: "Doações", target_amount: 0, current_amount: 600 }, 100, "2026-08");
    expect(projection.saved).toBe(600);
    expect(projection.target).toBe(0);
    expect(projection.progress).toBe(0);
    expect(projection.monthsToFinish).toBeNull();
    expect(projection.estimatedMonth).toBeNull();
  });

  it("não inventa orientação quando ainda não existem dados", () => {
    const summary = summarizeMonth([], "2026-08");
    const insights = buildInsights({ refMonth: "2026-08", summary, comparison: compareMonths([], "2026-08") });
    expect(insights).toHaveLength(1);
    expect(insights[0].text).toContain("Continue registrando seus meses");
  });
});
