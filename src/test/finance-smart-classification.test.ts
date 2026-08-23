import { describe, expect, it } from "vitest";
import {
  resolveHistoricalClassification,
  resolveSmartCategoryId,
  type SmartCategoryOption,
} from "@/lib/financeSmartClassification";

const categories: SmartCategoryOption[] = [
  { id: "transport", name: "Transporte", kind: "expense", parent_id: null },
  { id: "uber", name: "Uber e Táxi", kind: "expense", parent_id: "transport" },
  { id: "fuel", name: "Gasolina", kind: "expense", parent_id: "transport" },
  { id: "public", name: "Transporte Público", kind: "expense", parent_id: "transport" },
  { id: "car", name: "Carro", kind: "expense", parent_id: "transport" },
  { id: "food", name: "Alimentação", kind: "expense", parent_id: null },
  { id: "delivery", name: "Delivery", kind: "expense", parent_id: "food" },
  { id: "other", name: "Outros", kind: "expense", parent_id: null },
  { id: "salary", name: "Salário", kind: "income", parent_id: null },
];

const resolve = (
  description: string,
  hint: string | null,
  options: SmartCategoryOption[] = categories,
  type: "expense" | "income" = "expense",
) => resolveSmartCategoryId({ categories: options, description, hint, type });

describe("smart transaction category resolution", () => {
  it.each([
    ["Uber 45 reais cartão", "uber"],
    ["gasolina 200 reais no cartão", "fuel"],
    ["metrô 6,90 no cartão", "public"],
    ["estacionamento 25 reais no cartão", "car"],
  ])("prefers the specific child for %s when AI suggests Transporte", (description, expectedId) => {
    expect(resolve(description, "Transporte")).toBe(expectedId);
  });

  it("matches labels independently of accents, case and category order", () => {
    expect(resolve("Uber 45", "UBER E TAXI", [...categories].reverse())).toBe("uber");
  });

  it("keeps a specific AI child instead of downgrading it to a local parent", () => {
    expect(resolve("Uber Eats almoço", "Delivery")).toBe("delivery");
  });

  it("keeps the AI parent when the inferred child does not exist", () => {
    const withoutUber = categories.filter((category) => category.id !== "uber");
    expect(resolve("Uber 45 reais cartão", "Transporte", withoutUber)).toBe("transport");
  });

  it("uses a deterministic specific category when the AI hint is missing or generic", () => {
    expect(resolve("Uber 45 reais cartão", null)).toBe("uber");
    expect(resolve("Uber 45 reais cartão", "Outros")).toBe("uber");
  });

  it("never selects an expense category for income", () => {
    expect(resolve("Uber 45 reais cartão", "Transporte", categories, "income")).toBe("");
  });

  it("reuses the latest classification for the same normalized person", () => {
    const history = [
      { source: "Receita Gabriella Meneses", type: "income", category_id: "transfer-in", account_id: "checking", payment_method: "pix" },
      { source: "Gabriella Meneses", type: "income", category_id: "older", account_id: "cash", payment_method: null },
    ];

    expect(resolveHistoricalClassification(history, "GABRIELLA   MENESES", "income")).toMatchObject({
      category_id: "transfer-in",
      account_id: "checking",
      payment_method: "pix",
    });
  });

  it("does not copy a classification from a different transaction type", () => {
    const history = [
      { source: "Gabriella Meneses", type: "expense", category_id: "food", account_id: "card" },
    ];
    expect(resolveHistoricalClassification(history, "Gabriella Meneses", "income")).toBeUndefined();
  });
});
