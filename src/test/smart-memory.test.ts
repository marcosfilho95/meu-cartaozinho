import { describe, expect, it } from "vitest";
import { findMemoryMatch, shiftDateToMonth, type MemoryTransaction } from "@/lib/finance/smartMemory";

const history: MemoryTransaction[] = [
  { source: "Enel conta de luz", type: "expense", amount: 210, category_id: "cat-casa", account_id: "acc-cc", payment_method: "boleto", transaction_date: "2026-08-10" },
  { source: "Salário Cisne", type: "income", amount: 7000, category_id: "cat-salario", account_id: "acc-cc", payment_method: null, transaction_date: "2026-08-05" },
];

describe("smartMemory", () => {
  it("encontra o lançamento anterior pelo nome", () => {
    const match = findMemoryMatch(history, "conta de luz 230");
    expect(match?.source).toBe("Enel conta de luz");
    expect(match?.day).toBe(10);
    expect(match?.amount).toBe(210);
    expect(match?.category_id).toBe("cat-casa");
  });

  it("respeita o tipo quando informado", () => {
    const match = findMemoryMatch(history, "salario cisne recebido", "income");
    expect(match?.source).toBe("Salário Cisne");
    expect(match?.amount).toBe(7000);
  });

  it("não inventa correspondência sem palavras em comum", () => {
    expect(findMemoryMatch(history, "cinema 40")).toBeNull();
  });

  it("move a data para o mês de referência mantendo o dia", () => {
    expect(shiftDateToMonth(10, new Date(2026, 8, 16))).toBe("2026-09-10");
    expect(shiftDateToMonth(31, new Date(2026, 1, 10))).toBe("2026-02-28");
  });
});
