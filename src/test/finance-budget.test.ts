import { describe, expect, it } from "vitest";
import {
  getBudgetCoverage,
  getCategoryDepth,
  getCategorySpent,
  hasBudgetHierarchyConflict,
  parseBudgetAmount,
} from "@/lib/financeBudget";
import {
  isBankCategory,
  isGenericCardCategory,
  resolveBankCategoryColor,
} from "@/lib/financeShared";
import { resolveBankColor } from "@/lib/categoryColors";
import { getBrandLockedColor } from "@/lib/financeCategoryColors";

const categories = [
  { id: "transport", parent_id: null },
  { id: "car", parent_id: "transport" },
  { id: "fuel", parent_id: "transport" },
  { id: "food", parent_id: null },
];

describe("finance budget helpers", () => {
  it("parses common Brazilian currency inputs", () => {
    expect(parseBudgetAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseBudgetAmount("1.500")).toBe(1500);
    expect(parseBudgetAmount("250,90")).toBe(250.9);
    expect(parseBudgetAmount("valor inválido")).toBeNull();
  });

  it("rolls child expenses into a parent budget without losing direct expenses", () => {
    const expenses = { transport: 10, car: 120, fuel: 80, food: 50 };

    expect(getCategorySpent("transport", expenses, categories)).toBe(210);
    expect(getCategorySpent("car", expenses, categories)).toBe(120);
    expect([...getBudgetCoverage(["transport"], categories)]).toEqual(
      expect.arrayContaining(["transport", "car", "fuel"]),
    );
  });

  it("blocks overlapping parent and child budgets but allows sibling budgets", () => {
    expect(hasBudgetHierarchyConflict("car", ["transport"], categories)).toBe(true);
    expect(hasBudgetHierarchyConflict("transport", ["car"], categories)).toBe(true);
    expect(hasBudgetHierarchyConflict("fuel", ["car"], categories)).toBe(false);
    expect(hasBudgetHierarchyConflict("food", ["car"], categories)).toBe(false);
  });

  it("orders nested categories by their ancestry depth", () => {
    expect(getCategoryDepth("transport", categories)).toBe(0);
    expect(getCategoryDepth("car", categories)).toBe(1);
    expect(getCategoryDepth("missing", categories)).toBe(0);
  });

  it("matches punctuated bank names without mistaking Internet for Banco Inter", () => {
    expect(isBankCategory("Internet")).toBe(false);
    expect(isBankCategory("Conta Inter")).toBe(true);
    expect(isBankCategory("Caixa de remédios")).toBe(false);
    expect(isBankCategory("Caixa")).toBe(true);
    expect(isBankCategory("Nubank/Ultravioleta")).toBe(true);
    expect(isBankCategory("Mercado-Pago")).toBe(true);
    expect(isGenericCardCategory("Cartão de crédito")).toBe(true);
    expect(resolveBankCategoryColor("Internet", "#123456")).toBe("#123456");
    expect(resolveBankCategoryColor("Nubank/Ultravioleta", "#123456")).toBe("#8A05BE");
    expect(resolveBankCategoryColor("Mercado-Pago", "#123456")).toBe("#009EE3");
    expect(resolveBankColor("Internet")).toBeUndefined();
    expect(resolveBankColor("Caixa de remédios")).toBeUndefined();
    expect(resolveBankColor("Nubank/Ultravioleta")).toBe("#8A05BE");
    expect(resolveBankColor("Mercado-Pago")).toBe("#009EE3");
    expect(getBrandLockedColor("Internet")).toBeNull();
    expect(getBrandLockedColor("Caixa de remédios")).toBeNull();
    expect(getBrandLockedColor("Nubank/Ultravioleta")).toBe("#8A05BE");
    expect(getBrandLockedColor("Mercado-Pago")).toBe("#009EE3");
  });
});
