/**
 * Centralized category color system.
 * Single source of truth for all category colors across all components.
 */

import {
  BANK_COLORS,
  isBankCategory as matchesBankCategory,
  isGenericCardCategory as matchesGenericCardCategory,
  resolveBankCategoryColor,
} from "@/lib/financeShared";

/**
 * Resolve bank color from category name. Returns undefined if not a bank.
 */
export const resolveBankColor = (name: string): string | undefined => {
  return resolveBankCategoryColor(name, "") || undefined;
};

/**
 * Generate a unique HSL color using golden angle distribution.
 * Avoids repetition by distributing hues evenly around the color wheel.
 */
export const generateCategoryColor = (index: number): string => {
  const hue = Math.round((index * 137.508) % 360);
  const saturation = 60 + (index % 3) * 5; // 60-70%
  const lightness = 50 + (index % 3) * 5;  // 50-60%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * Resolve color for a category. Priority:
 * 1. Bank color (fixed)
 * 2. Stored color from DB
 * 3. Fallback
 */
export const resolveCategoryColor = (
  categoryName: string,
  storedColor?: string | null,
): string => {
  const bankColor = resolveBankColor(categoryName);
  if (bankColor) return bankColor;
  return storedColor || "#AEB6BF";
};

export type CategoryColorMap = Record<string, string>;

/**
 * Build a stable color map from category list.
 * Use this ONCE and pass it to all components that need category colors.
 */
export const buildCategoryColorMap = (
  categories: Array<{ id: string; name: string; color?: string | null }>,
): CategoryColorMap => {
  const map: CategoryColorMap = {};
  categories.forEach((cat) => {
    map[cat.id] = resolveCategoryColor(cat.name, cat.color);
  });
  map["uncategorized"] = "#AEB6BF";
  return map;
};

export const isBankCategory = (label: string): boolean => {
  return matchesBankCategory(label);
};

export const isGenericCardCategory = (label: string): boolean => {
  return matchesGenericCardCategory(label);
};

export { BANK_COLORS };
