import { describe, expect, it } from "vitest";
import { estimateFixedIncome, getFixedIncomeAnnualRate } from "@/lib/investments";

describe("fixed-income investment estimates", () => {
  it("converts a CDI percentage to its estimated annual rate", () => {
    expect(getFixedIncomeAnnualRate("cdi", 105, [{ rate_key: "cdi", annual_rate: 12, as_of_date: "2026-01-01", source: "test", is_approximation: false, updated_at: "2026-01-01" }])).toBeCloseTo(12.6);
  });

  it("applies the regressive IR estimate and no IOF after thirty days", () => {
    const result = estimateFixedIncome({ principal: 1_000, annualRate: 12, startedAt: "2026-01-01", taxable: true, asOf: new Date("2026-03-01T12:00:00") });
    expect(result.days).toBe(59);
    expect(result.estimatedTaxes).toBeCloseTo(result.grossYield * 0.225);
  });

  it("exempts LCI/LCA estimates from IR and IOF", () => {
    const result = estimateFixedIncome({ principal: 1_000, annualRate: 12, startedAt: "2026-01-01", taxable: false, asOf: new Date("2026-01-10T12:00:00") });
    expect(result.estimatedTaxes).toBe(0);
  });
});
