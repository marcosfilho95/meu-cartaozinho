import {
  CATEGORY_COLORS,
  FinanceTx,
  getMonthLabel,
  resolveBankCategoryColor,
} from "@/lib/financeShared";

export type MonthTrend = "up" | "down" | "stable";

export const trendFromDelta = (delta: number): MonthTrend => (delta > 0.001 ? "up" : delta < -0.001 ? "down" : "stable");

export const getMonthlyIncome = (transactions: FinanceTx[]) =>
  transactions
    .filter((tx) => tx.type === "income" && tx.status !== "canceled")
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

export const getMonthlyExpenses = (transactions: FinanceTx[]) =>
  transactions
    .filter((tx) => tx.type === "expense" && tx.status !== "canceled")
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

export const getPendingTransactions = (transactions: FinanceTx[]) =>
  transactions
    .filter((tx) => tx.status === "pending" || tx.status === "overdue")
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

export const getDashboardSummary = (transactions: FinanceTx[]) => {
  const monthTx = transactions.filter((tx) => tx.status !== "canceled");
  const totalIncome = monthTx.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0);
  const totalExpense = monthTx.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0);
  const paidExpense = monthTx.filter((tx) => tx.type === "expense" && tx.status === "paid").reduce((s, tx) => s + Number(tx.amount), 0);
  const pendingExpense = monthTx
    .filter((tx) => tx.type === "expense" && (tx.status === "pending" || tx.status === "overdue"))
    .reduce((s, tx) => s + Number(tx.amount), 0);
  return {
    totalIncome,
    totalExpense,
    paidExpense,
    pendingExpense,
    balance: totalIncome - totalExpense,
  };
};

export const getExpensesByCategory = (transactions: FinanceTx[]) => {
  const grouped: Record<string, { key: string; label: string; value: number; color: string; percentage: number }> = {};
  let total = 0;

  transactions
    .filter((tx) => tx.type === "expense" && tx.status !== "canceled")
    .forEach((tx, index) => {
      const id = tx.category_id || "uncategorized";
      const label = tx.categories?.name || "Sem categoria";
      const baseColor = tx.categories?.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length];
      const color = resolveBankCategoryColor(label, baseColor);
      if (!grouped[id]) grouped[id] = { key: id, label, value: 0, color, percentage: 0 };
      const amount = Number(tx.amount);
      grouped[id].value += amount;
      total += amount;
    });

  return Object.values(grouped)
    .map((item) => ({
      ...item,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
};

export const getExpenseHistory = (transactions: FinanceTx[], evolutionKeys: string[]) => {
  const monthMap: Record<string, { month: string; totalDespesas: number; categories: Record<string, number> }> = {};
  const categoryMap: Record<string, { id: string; label: string; color: string; total: number }> = {};

  evolutionKeys.forEach((key) => {
    monthMap[key] = { month: getMonthLabel(key), totalDespesas: 0, categories: {} };
  });

  transactions.forEach((tx, index) => {
    if (tx.type !== "expense" || tx.status === "canceled") return;
    const key = tx.transaction_date.slice(0, 7);
    if (!monthMap[key]) return;

    const categoryId = tx.category_id || "uncategorized";
    const label = tx.categories?.name || "Sem categoria";
    const baseColor = tx.categories?.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    const color = resolveBankCategoryColor(label, baseColor);
    const value = Number(tx.amount);

    monthMap[key].totalDespesas += value;
    monthMap[key].categories[categoryId] = (monthMap[key].categories[categoryId] || 0) + value;

    if (!categoryMap[categoryId]) categoryMap[categoryId] = { id: categoryId, label, color, total: 0 };
    categoryMap[categoryId].total += value;
  });

  const orderedCategories = Object.values(categoryMap).sort((a, b) => b.total - a.total);
  const stacked = evolutionKeys.map((key) => {
    const row: Record<string, number | string> = {
      month: monthMap[key].month,
      totalDespesas: monthMap[key].totalDespesas,
    };
    orderedCategories.forEach((category) => {
      row[`cat_${category.id}`] = monthMap[key].categories[category.id] || 0;
    });
    return row;
  });

  return { categories: orderedCategories, stacked };
};

