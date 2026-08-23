import { describe, expect, it } from "vitest";
import {
  matchAccountByInstitution,
  mergeAiWithDeterministicResult,
  parseBrazilianCurrency,
  parseDeterministicTransaction,
} from "@/lib/finance/smartInputParser";

const referenceDate = new Date(2026, 7, 23, 12);

describe("deterministic smart input parser", () => {
  it.each([
    ["Nubank fatura de 2706,27 reais no mês de MAIO", 2706.27, "2026-05-05", "Nubank", "Fatura Nubank"],
    ["fatura c6 julho 3250,40", 3250.4, "2026-07-05", "C6", "Fatura C6"],
    ["PicPay 1500 junho", 1500, "2026-06-05", "PicPay", "PicPay"],
    ["Nubank 2800 vencimento dia 10 de maio", 2800, "2026-05-10", "Nubank", "Nubank"],
    ["Fatura Nubank de R$ 2.800,50 em agosto", 2800.5, "2026-08-05", "Nubank", "Fatura Nubank"],
    ["Fatura C6 de julho R$ 3.250,40", 3250.4, "2026-07-05", "C6", "Fatura C6"],
    ["Mercado Pago agosto 980", 980, "2026-08-05", "Mercado Pago", "Mercado Pago"],
  ])("extracts explicit data from %s", (input, amount, date, institution, description) => {
    const result = parseDeterministicTransaction(input, referenceDate);
    expect(result).toMatchObject({ amount, date, institution, description });
  });

  it("recognizes income and a deterministic category without inventing an institution", () => {
    expect(parseDeterministicTransaction("Recebi 7000 de salário em agosto", referenceDate)).toMatchObject({
      type: "income",
      amount: 7000,
      date: "2026-08-05",
      institution: null,
      category_hint: "Salário",
    });
  });

  it("recognizes merchant, payment method and yesterday", () => {
    expect(parseDeterministicTransaction("Paguei 120 de gasolina ontem", referenceDate)).toMatchObject({
      type: "expense",
      amount: 120,
      description: "Gasolina",
      date: "2026-08-22",
      category_hint: "Gasolina",
    });
    expect(parseDeterministicTransaction("Uber 45 reais no cartão", referenceDate)).toMatchObject({
      amount: 45,
      payment_method: "credit",
      category_hint: "Uber e Táxi",
    });
  });

  it.each([
    ["Nubank 2800 em 05/2026", "2026-05-05"],
    ["Nubank 2800 em 05-2026", "2026-05-05"],
    ["Nubank 2800 em 2026-05", "2026-05-05"],
    ["Nubank 2800 em 10/05/2026", "2026-05-10"],
  ])("supports numeric date format in %s", (input, expectedDate) => {
    expect(parseDeterministicTransaction(input, referenceDate)?.date).toBe(expectedDate);
  });

  it.each([
    ["2800", 2800],
    ["2800,50", 2800.5],
    ["2.800", 2800],
    ["2.800,50", 2800.5],
    ["R$ 2.800,50", 2800.5],
    ["2706,27 reais", 2706.27],
  ])("parses Brazilian currency %s", (input, expected) => {
    expect(parseBrazilianCurrency(input)).toBe(expected);
  });

  it("is identical over repeated executions", () => {
    const input = "Nubank fatura de 2706,27 reais no mês de maio";
    const results = Array.from({ length: 20 }, () => parseDeterministicTransaction(input, referenceDate));
    expect(new Set(results.map((result) => JSON.stringify(result)))).toHaveLength(1);
  });

  it("returns null when there is no identifiable amount", () => {
    expect(parseDeterministicTransaction("fatura do Nubank em maio", referenceDate)).toBeNull();
  });
});

describe("smart parser merge and account matching", () => {
  const accounts = [
    { id: "c6", name: "Cartão C6", institution: "C6 Bank", type: "credit_card" },
    { id: "nu", name: "Meu Nubank", institution: "Nubank", type: "credit_card" },
  ];

  it("matches the explicitly named institution instead of the first credit card", () => {
    expect(matchAccountByInstitution(accounts, "Nubank")).toBe("nu");
    expect(matchAccountByInstitution(accounts, "C6")).toBe("c6");
  });

  it("leaves account empty when the explicit institution has no matching account", () => {
    expect(matchAccountByInstitution(accounts, "Amazon Prime")).toBe("");
  });

  it("keeps explicit local fields when AI contradicts them", () => {
    const local = parseDeterministicTransaction("Nubank fatura maio 2708,67", referenceDate)!;
    const merged = mergeAiWithDeterministicResult({
      type: "expense",
      role: "expense",
      amount: 2800,
      description: "Fatura C6",
      date: "2026-06-01",
      institution: "C6",
      category_hint: "Nubank",
      payment_method: "credit",
      confidence: 0.9,
    }, local);

    expect(merged).toMatchObject({
      type: "expense",
      role: "expense",
      amount: 2708.67,
      date: "2026-05-05",
      institution: "Nubank",
      description: "Fatura Nubank",
      category_hint: null,
    });
  });
});
