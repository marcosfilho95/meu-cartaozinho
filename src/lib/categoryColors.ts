/**
 * Centralized category color system.
 * Single source of truth for all category colors across all components.
 */

/** Fixed bank colors — NEVER change these */
const BANK_COLORS: Record<string, string> = {
  nubank: "#8A05BE",
  picpay: "#21C25E",
  "mercado pago": "#009EE3",
  mercadopago: "#009EE3",
  c6: "#111111",
  itau: "#EC7000",
  "banco do brasil": "#F7C400",
  bb: "#F7C400",
  bradesco: "#CC092F",
  santander: "#EC0000",
  caixa: "#005CA8",
  inter: "#FF7A00",
};

const normalize = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Resolve bank color from category name. Returns undefined if not a bank.
 */
export const resolveBankColor = (name: string): string | undefined => {
  const n = normalize(name);
  const direct = BANK_COLORS[n];
  if (direct) return direct;
  const match = Object.entries(BANK_COLORS).find(([key]) => n.includes(key));
  return match?.[1];
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
  const n = normalize(label);
  if (n === "cartao" || n === "cartoes") return false;
  return Object.keys(BANK_COLORS).some((key) => n.includes(key));
};

export const isGenericCardCategory = (label: string): boolean => {
  const n = normalize(label);
  return n === "cartao" || n === "cartoes";
};

export { BANK_COLORS };
