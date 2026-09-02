import { describe, expect, it } from "vitest";

import {
  getMonthPaymentStatus,
  isInstallmentFromMonth,
} from "@/lib/installments";

describe("escopo mensal das parcelas", () => {
  it("inclui somente parcelas do mês selecionado", () => {
    expect(isInstallmentFromMonth({ ref_month: "2026-09" }, "2026-09")).toBe(true);
    expect(isInstallmentFromMonth({ ref_month: "2026-08" }, "2026-09")).toBe(false);
    expect(isInstallmentFromMonth({ ref_month: "2026-10" }, "2026-09")).toBe(false);
  });

  it("não leva pendências de meses anteriores para o status do mês", () => {
    const installments = [
      { ref_month: "2026-08", status: "pendente" },
      { ref_month: "2026-09", status: "pago" },
      { ref_month: "2026-10", status: "pendente" },
    ];

    expect(getMonthPaymentStatus(installments, "2026-09")).toBe("paid");
  });

  it("considera vazio um mês que só possui pendências em outros meses", () => {
    expect(getMonthPaymentStatus([
      { ref_month: "2026-08", status: "pendente" },
    ], "2026-09")).toBe("empty");
  });
});
