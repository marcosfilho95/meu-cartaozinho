import { describe, expect, it } from "vitest";

import {
  aggregateCartaozinhoRows,
  cartaozinhoExternalId,
  cartaozinhoReceiptMonth,
  cartaozinhoSourceMonthFromExternalId,
  cartaozinhoSourceMonthForReceipt,
  shouldSyncCartaozinhoSourceMonth,
} from "@/lib/finance/cartaozinhoSync";

describe("cartaozinhoSync", () => {
  it("cria um identificador mensal estável", () => {
    expect(cartaozinhoExternalId("2026-09")).toBe("meu_cartaozinho:2026-09");
  });

  it("mantém no Organizador o total do próprio mês do Cartãozinho", () => {
    expect(cartaozinhoReceiptMonth("2026-05")).toBe("2026-05");
    expect(cartaozinhoReceiptMonth("2026-12")).toBe("2026-12");
    expect(cartaozinhoSourceMonthForReceipt("2026-07")).toBe("2026-07");
  });

  it("identifica o mês de origem sem confundir com o mês da receita", () => {
    expect(cartaozinhoSourceMonthFromExternalId("meu_cartaozinho:2026-08")).toBe("2026-08");
    expect(cartaozinhoReceiptMonth("2026-08")).toBe("2026-08");
    expect(cartaozinhoSourceMonthFromExternalId("meu_cartaozinho:2026-13")).toBeNull();
    expect(cartaozinhoSourceMonthFromExternalId("importacao:2026-08")).toBeNull();
  });

  it("começa a integração somente em maio de 2026", () => {
    expect(shouldSyncCartaozinhoSourceMonth("2026-04")).toBe(false);
    expect(shouldSyncCartaozinhoSourceMonth("2026-05")).toBe(true);
    expect(shouldSyncCartaozinhoSourceMonth("2027-01")).toBe(true);
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
