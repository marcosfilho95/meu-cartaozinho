import { describe, expect, it } from "vitest";

import {
  getLocalYearMonth,
  getTransactionCompetenceMonth,
  shouldIncludeInRealizedCalculations,
} from "@/lib/financeRealization";

const currentAugust = new Date(2026, 7, 23, 23, 59, 59);

const recurringPaid = (competenceMonth: string, transactionDate: string) => ({
  status: "paid" as const,
  recurrence_id: "recurrence-1",
  competence_month: competenceMonth,
  transaction_date: transactionDate,
});

describe("realização de lançamentos recorrentes", () => {
  it("usa ano e mês do timezone local", () => {
    expect(getLocalYearMonth(currentAugust)).toBe("2026-08");
  });

  it("prioriza a competência e ignora o dia da transação", () => {
    expect(getTransactionCompetenceMonth(recurringPaid("2026-08", "2026-09-30"))).toBe("2026-08");
    expect(shouldIncludeInRealizedCalculations(recurringPaid("2026-08", "2026-08-31"), currentAugust)).toBe(true);
  });

  it("inclui as competências desde o início até o mês atual", () => {
    expect(shouldIncludeInRealizedCalculations(recurringPaid("2026-06", "2026-06-05"), currentAugust)).toBe(true);
    expect(shouldIncludeInRealizedCalculations(recurringPaid("2026-07", "2026-07-05"), currentAugust)).toBe(true);
    expect(shouldIncludeInRealizedCalculations(recurringPaid("2026-08", "2026-08-05"), currentAugust)).toBe(true);
  });

  it("exclui uma competência futura marcada como realizada", () => {
    expect(shouldIncludeInRealizedCalculations(recurringPaid("2026-09", "2026-09-05"), currentAugust)).toBe(false);
  });

  it("não altera lançamentos não recorrentes nem pendentes", () => {
    expect(shouldIncludeInRealizedCalculations({ ...recurringPaid("2026-09", "2026-09-05"), recurrence_id: null }, currentAugust)).toBe(true);
    expect(shouldIncludeInRealizedCalculations({ ...recurringPaid("2026-09", "2026-09-05"), status: "pending" }, currentAugust)).toBe(true);
  });
});
