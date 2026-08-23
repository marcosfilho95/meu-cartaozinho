export type BudgetCategoryNode = {
  id: string;
  parent_id: string | null;
};

export type MonthlyBudgetRow = {
  category_id?: string | null;
  limit_amount?: number | string | null;
};

/**
 * A row without category is the main monthly spending cap. Category budgets are
 * kept as optional detail and only act as a legacy fallback when no main cap
 * has been defined yet.
 */
export const getMonthlySpendingGoal = (budgets: MonthlyBudgetRow[]) => {
  const mainGoal = budgets.find(
    (budget) => budget.category_id == null && Number(budget.limit_amount || 0) > 0,
  );

  if (mainGoal) return Number(mainGoal.limit_amount || 0);

  return budgets.reduce((total, budget) => {
    if (!budget.category_id) return total;
    return total + Math.max(0, Number(budget.limit_amount || 0));
  }, 0);
};

export const parseBudgetAmount = (value: string) => {
  let normalized = value.trim().replace(/R\$/gi, "").replace(/\s+/g, "");
  if (!normalized) return null;

  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");

  if (commaIndex >= 0 && dotIndex >= 0) {
    normalized = commaIndex > dotIndex
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (commaIndex >= 0) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
};

export const getCategoryCoverage = (categoryId: string, categories: BudgetCategoryNode[]) => {
  const childrenByParent = new Map<string, string[]>();
  categories.forEach((category) => {
    if (!category.parent_id) return;
    const children = childrenByParent.get(category.parent_id) || [];
    children.push(category.id);
    childrenByParent.set(category.parent_id, children);
  });

  const covered = new Set<string>();
  const pending = [categoryId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (covered.has(current)) continue;
    covered.add(current);
    pending.push(...(childrenByParent.get(current) || []));
  }
  return covered;
};

export const getBudgetCoverage = (categoryIds: string[], categories: BudgetCategoryNode[]) => {
  const covered = new Set<string>();
  categoryIds.forEach((categoryId) => {
    getCategoryCoverage(categoryId, categories).forEach((id) => covered.add(id));
  });
  return covered;
};

export const getCategoryDepth = (categoryId: string, categories: BudgetCategoryNode[]) => {
  const parentById = new Map(categories.map((category) => [category.id, category.parent_id]));
  const visited = new Set<string>();
  let currentId: string | null | undefined = categoryId;
  let depth = 0;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    currentId = parentById.get(currentId);
    if (currentId) depth += 1;
  }

  return depth;
};

export const getCategorySpent = (
  categoryId: string,
  expenses: Record<string, number>,
  categories: BudgetCategoryNode[],
) => {
  let total = 0;
  getCategoryCoverage(categoryId, categories).forEach((id) => {
    total += Number(expenses[id] || 0);
  });
  return total;
};

export const hasBudgetHierarchyConflict = (
  candidateCategoryId: string,
  budgetedCategoryIds: string[],
  categories: BudgetCategoryNode[],
) => {
  const candidateCoverage = getCategoryCoverage(candidateCategoryId, categories);
  return budgetedCategoryIds.some((budgetedId) => {
    const existingCoverage = getCategoryCoverage(budgetedId, categories);
    return [...candidateCoverage].some((id) => existingCoverage.has(id));
  });
};
