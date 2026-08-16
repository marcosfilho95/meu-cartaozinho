import { describe, expect, it } from "vitest";

import type { FinanceTx } from "@/lib/financeShared";
import {
  calculateMonthlyResult,
  calculateAccountBalanceEffect,
  calculateNetWorth,
  calculateReserveMovement,
} from "@/lib/financeOverview";

const tx = (partial: Partial<FinanceTx>): FinanceTx => ({
  id: Math.random().toString(36).slice(2),
  amount: 100,
  type: "expense",
  status: "paid",
  transaction_date: "2026-08-10",
  due_date: null,
  account_id: "account-1",
  category_id: null,
  ...partial,
});

describe("financeOverview", () => {
  it("calcula o efeito no saldo ao editar ou excluir lançamentos", () => {
    expect(calculateAccountBalanceEffect(tx({ type: "income", amount: 500, status: "paid" }))).toBe(500);
    expect(calculateAccountBalanceEffect(tx({ type: "expense", amount: 120, status: "paid" }))).toBe(-120);
    expect(calculateAccountBalanceEffect(tx({ type: "income", amount: 500, status: "pending" }))).toBe(0);
    expect(calculateAccountBalanceEffect(tx({ type: "transfer", amount: 500, status: "paid" }))).toBe(0);
  });

  it("soma contas e cofrinhos sem transformar aportes em perda patrimonial", () => {
    const summary = calculateNetWorth(
      [
        { type: "checking", current_balance: 4500, include_in_net_worth: true },
        { type: "investment", current_balance: 2000, include_in_net_worth: true },
      ],
      [{ current_amount: 500 }],
    );

    expect(summary).toEqual({ assets: 6500, goals: 500, debts: 0, total: 7000 });
  });

  it("desconta cartões, empréstimos e saldos negativos do patrimônio", () => {
    const summary = calculateNetWorth([
      { type: "checking", current_balance: 1000, include_in_net_worth: true },
      { type: "checking", current_balance: -200, include_in_net_worth: true },
      { type: "credit_card", current_balance: -600, include_in_net_worth: false },
      { type: "loan", current_balance: 300, include_in_net_worth: false },
    ]);

    expect(summary).toEqual({ assets: 1000, goals: 0, debts: 1100, total: -100 });
  });

  it("separa resultado registrado, realizado e pendências do mês de referência", () => {
    const summary = calculateMonthlyResult([
      tx({ type: "income", amount: 3000 }),
      tx({ amount: 1800 }),
      tx({ amount: 500, status: "pending" }),
      tx({ type: "income", amount: 400, status: "pending" }),
      tx({ amount: 999, status: "canceled" }),
      tx({ type: "transfer", amount: 800 }),
      tx({ amount: 700, transaction_date: "2026-07-30", due_date: "2026-08-10" }),
    ], "2026-08");

    expect(summary).toEqual({
      income: 3400,
      expenses: 2300,
      result: 1100,
      paidIncome: 3000,
      paidExpenses: 1800,
      paidResult: 1200,
      pendingIncome: 400,
      pendingExpenses: 500,
    });
  });

  it("usa ref_month e mantém aportes separados de retiradas", () => {
    const summary = calculateReserveMovement([
      { amount: 800, type: "deposit", ref_month: "2026-08" },
      { amount: 200, type: "withdraw", ref_month: "2026-08" },
      { amount: 100, type: "deposit", created_at: "2026-08-02T10:00:00Z" },
      { amount: 500, type: "deposit", ref_month: "2026-07" },
    ], "2026-08");

    expect(summary).toEqual({ deposits: 900, withdrawals: 200, net: 700 });
  });
});
