import { describe, expect, it } from "vitest";

import {
  aggregateCartaozinhoRows,
  cartaozinhoExternalId,
} from "@/lib/finance/cartaozinhoSync";

describe("cartaozinhoSync", () => {
  it("cria um identificador mensal estável", () => {
    expect(cartaozinhoExternalId("2026-09")).toBe("meu_cartaozinho:2026-09");
  });

  it("soma parcelas por mês e deduplica pessoas sem diferenciar maiúsculas", () => {
    const result = aggregateCartaozinhoRows(["2026-08", "2026-09"], [
      { amount: 100.1, ref_month: "2026-08", purchases: { person: "Ana" } },
      { amount: "200.20", ref_month: "2026-08", purchases: { person: "ana" } },
      { amount: 50, ref_month: "2026-08", purchases: { person: "Bruno" } },
      { amount: 300, ref_month: "2026-09", purchases: { person: "Carla" } },
      { amount: 999, ref_month: "2026-10", purchases: { person: "Fora do período" } },
    ]);

    expect(result["2026-08"]).toEqual({ refMonth: "2026-08", total: 350.3, installments: 3, people: 2 });
    expect(result["2026-09"]).toEqual({ refMonth: "2026-09", total: 300, installments: 1, people: 1 });
  });

  it("mantém meses sem parcelas com total zero", () => {
    const result = aggregateCartaozinhoRows(["2026-11"], []);
    expect(result["2026-11"]).toEqual({ refMonth: "2026-11", total: 0, installments: 0, people: 0 });
  });
});
