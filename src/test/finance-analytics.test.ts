import { describe, expect, it } from "vitest";
import type { FinanceTx } from "@/lib/financeShared";
import {
  buildExpenseBreakdown,
  buildMonthlyEvolution,
  buildSavingsTrend,
} from "@/lib/financeAnalytics";

const tx = (partial: Partial<FinanceTx>): FinanceTx => ({
  id: Math.random().toString(36).slice(2),
  amount: 100,
  type: "expense",
  status: "paid",
  transaction_date: "2026-08-10",
  account_id: "acc-1",
  category_id: "cat-1",
  ...partial,
});

describe("financeAnalytics", () => {
  const keys = ["2026-07", "2026-08"];
  const transactions: FinanceTx[] = [
    tx({ type: "income", amount: 5000, transaction_date: "2026-07-05" }),
    tx({ amount: 3000, transaction_date: "2026-07-12" }),
    tx({ type: "income", amount: 5000, transaction_date: "2026-08-05" }),
    tx({ amount: 2000, transaction_date: "2026-08-12", accounts: { id: "acc-1", name: "Nubank", type: "credit_card" } }),
    tx({ amount: 500, transaction_date: "2026-08-15", account_id: "acc-2", category_id: "cat-2", accounts: { id: "acc-2", name: "Conta Corrente", type: "checking" }, categories: { id: "cat-2", name: "Moradia", color: "#45B7D1", parent_id: null } }),
    tx({ amount: 999, transaction_date: "2026-08-16", status: "canceled" }),
    tx({ type: "transfer", amount: 800, transaction_date: "2026-08-17" }),
  ];

  it("ignora canceladas e transferências na evolução mensal", () => {
    const points = buildMonthlyEvolution(transactions, keys);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ receitas: 5000, despesas: 3000, saldo: 2000 });
    expect(points[1]).toMatchObject({ receitas: 5000, despesas: 2500, saldo: 2500 });
    expect(Math.round(points[1].savingsRate)).toBe(50);
  });

  it("agrupa despesas por conta/cartão com percentuais", () => {
    const byAccount = buildExpenseBreakdown(transactions, "account", { months: ["2026-08"] });
    expect(byAccount.map((item) => item.name)).toEqual(["Nubank", "Conta Corrente"]);
    expect(byAccount[0].value).toBe(2000);
    expect(Math.round(byAccount[0].percentage)).toBe(80);
  });

  it("agrupa despesas por categoria", () => {
    const byCategory = buildExpenseBreakdown(transactions, "category", { months: ["2026-08"] });
    expect(byCategory).toHaveLength(2);
    expect(byCategory[0].value).toBe(2000);
  });

  it("detecta se o usuário está poupando mais", () => {
    const trend = buildSavingsTrend(buildMonthlyEvolution(transactions, keys));
    expect(trend.direction).toBe("saving");
    expect(trend.delta).toBe(500);
    expect(trend.expensesDelta).toBe(-500);
  });
});