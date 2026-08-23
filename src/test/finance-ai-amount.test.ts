import { describe, expect, it } from "vitest";

import { parseAiFinancialAmount } from "../../supabase/functions/_shared/financeParsing";

describe("parseAiFinancialAmount", () => {
  it("aceita número retornado pela IA", () => {
    expect(parseAiFinancialAmount(4189.25)).toBe(4189.25);
  });

  it("aceita moeda brasileira retornada como texto", () => {
    expect(parseAiFinancialAmount("R$ 4.189,25")).toBe(4189.25);
    expect(parseAiFinancialAmount("4.189,25")).toBe(4189.25);
  });

  it("rejeita conteúdo sem valor positivo", () => {
    expect(parseAiFinancialAmount("sem valor")).toBeNull();
    expect(parseAiFinancialAmount(0)).toBeNull();
  });
});
