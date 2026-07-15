import { suggestCategoryName } from "@/lib/finance/imports/utils";

const normalizeLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export type SmartTransactionType = "income" | "expense";

export interface SmartCategoryOption {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  parent_id?: string | null;
}

const FALLBACK_RULE_NAMES = new Set(["outros", "outros (receita)", "outros receita"]);

const KNOWN_GENERIC_CATEGORY_NAMES = new Set([
  "alimentacao",
  "assinaturas",
  "casa",
  "compras",
  "cuidados pessoais",
  "educacao",
  "impostos",
  "investimentos",
  "lazer",
  "outros",
  "pet",
  "renda extra",
  "saude",
  "salario",
  "transferencias",
  "transporte",
  "vestuario",
]);

const getCategoryDepth = (category: SmartCategoryOption, categories: SmartCategoryOption[]) => {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current: SmartCategoryOption | undefined = category;
  let depth = 0;

  while (current?.parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parent_id);
    if (current) depth += 1;
  }

  return depth;
};

const isDescendantOf = (
  category: SmartCategoryOption,
  possibleAncestor: SmartCategoryOption,
  categories: SmartCategoryOption[],
) => {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let parentId = category.parent_id;

  while (parentId && !visited.has(parentId)) {
    if (parentId === possibleAncestor.id) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parent_id;
  }

  return false;
};

const findCategoryByLabel = (categories: SmartCategoryOption[], label: string | null | undefined) => {
  const normalized = normalizeLabel(String(label || ""));
  if (!normalized) return undefined;

  const exact = categories.find((category) => normalizeLabel(category.name) === normalized);
  if (exact) return exact;
  if (normalized.length < 3) return undefined;

  return categories
    .filter((category) => {
      const categoryName = normalizeLabel(category.name);
      return categoryName.includes(normalized) || normalized.includes(categoryName);
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(normalizeLabel(left.name).length - normalized.length);
      const rightDistance = Math.abs(normalizeLabel(right.name).length - normalized.length);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      const depthDifference = getCategoryDepth(right, categories) - getCategoryDepth(left, categories);
      if (depthDifference !== 0) return depthDifference;
      return normalizeLabel(left.name).localeCompare(normalizeLabel(right.name));
    })[0];
};

const isGenericCategory = (category: SmartCategoryOption, categories: SmartCategoryOption[]) =>
  categories.some((item) => item.parent_id === category.id)
  || KNOWN_GENERIC_CATEGORY_NAMES.has(normalizeLabel(category.name));

/**
 * Combines the model hint with local, deterministic merchant rules.
 * A specific child category wins over a generic parent, while an already
 * specific AI choice is never downgraded to a broad local suggestion.
 */
export const resolveSmartCategoryId = ({
  categories,
  description,
  hint,
  type,
}: {
  categories: SmartCategoryOption[];
  description: string;
  hint: string | null | undefined;
  type: SmartTransactionType;
}) => {
  const pool = categories.filter((category) => category.kind === type);
  const hintedCategory = findCategoryByLabel(pool, hint);
  const ruleName = suggestCategoryName(description, type === "income" ? "CREDIT" : "DEBIT");
  const isFallbackRule = FALLBACK_RULE_NAMES.has(normalizeLabel(ruleName));
  const ruleCategory = isFallbackRule ? undefined : findCategoryByLabel(pool, ruleName);

  if (!hintedCategory) return ruleCategory?.id || "";
  if (!ruleCategory || hintedCategory.id === ruleCategory.id) return hintedCategory.id;

  if (isDescendantOf(ruleCategory, hintedCategory, pool)) return ruleCategory.id;
  if (isDescendantOf(hintedCategory, ruleCategory, pool)) return hintedCategory.id;

  if (isGenericCategory(hintedCategory, pool) && !isGenericCategory(ruleCategory, pool)) {
    return ruleCategory.id;
  }

  return hintedCategory.id;
};
