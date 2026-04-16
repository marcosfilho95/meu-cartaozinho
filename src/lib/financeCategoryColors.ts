import { BANK_COLORS, normalizeLabel } from "@/lib/financeShared";

const CATEGORY_COLOR_POOL = [
  "#E85D75",
  "#5B8DEF",
  "#F0A030",
  "#43B89C",
  "#A78BFA",
  "#EC6FCF",
  "#6DAFDB",
  "#D4915E",
  "#34D399",
  "#FBBF24",
  "#38BDF8",
  "#7DD3FC",
  "#FB923C",
  "#22C55E",
  "#F97316",
  "#14B8A6",
  "#EF4444",
  "#6366F1",
  "#84CC16",
  "#0EA5E9",
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const isBrandLockedByName = (name: string) => {
  const normalized = normalizeLabel(name);
  return Object.keys(BANK_COLORS).some((key) => normalized === key || normalized.includes(key));
};

export const getBrandLockedColor = (name: string) => {
  const normalized = normalizeLabel(name);
  const direct = BANK_COLORS[normalized];
  if (direct) return direct;
  const contains = Object.entries(BANK_COLORS).find(([key]) => normalized.includes(key));
  return contains?.[1] || null;
};

type CategoryForColor = { id?: string; name?: string | null; color?: string | null };

export const getAutoCategoryColor = ({
  name,
  categories,
  editingId,
}: {
  name: string;
  categories: CategoryForColor[];
  editingId?: string | null;
}) => {
  const lockedColor = getBrandLockedColor(name);
  if (lockedColor) return lockedColor;

  const usedCommonColors = new Set(
    categories
      .filter((category) => category.id !== editingId)
      .filter((category) => category.color)
      .filter((category) => !isBrandLockedByName(String(category.name || "")))
      .map((category) => String(category.color).toUpperCase()),
  );

  const availablePool = CATEGORY_COLOR_POOL.find((color) => !usedCommonColors.has(color.toUpperCase()));
  if (availablePool) return availablePool;

  const base = hashString(normalizeLabel(name));
  for (let i = 0; i < 48; i += 1) {
    const hue = (base + i * 31) % 360;
    const candidate = `hsl(${hue} 68% 52%)`;
    if (!usedCommonColors.has(candidate.toUpperCase())) return candidate;
  }

  return CATEGORY_COLOR_POOL[base % CATEGORY_COLOR_POOL.length];
};

