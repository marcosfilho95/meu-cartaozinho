import type { FinanceTx } from "@/lib/financeShared";
import { addMonthsToKey, monthKey } from "@/lib/financeShared";

export type PlanningGoal = {
  id?: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
  monthly_target?: number | null;
  is_completed?: boolean;
};

export type CategoryMovement = {
  id: string;
  label: string;
  color: string;
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
  share: number;
};

const DISCRETIONARY_TERMS = [
  "acessor",
  "assinatura",
  "bar",
  "cabeleireiro",
  "cinema",
  "compra",
  "cosmet",
  "delivery",
  "hobbies",
  "lazer",
  "restaurante",
  "roupa",
  "streaming",
  "uber",
  "viagem",
];

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const getLastClosedMonthKey = (today = new Date()) => addMonthsToKey(monthKey(today), -1);

export const getTransactionsForMonth = (transactions: FinanceTx[], refMonth: string) =>
  transactions.filter((transaction) => transaction.transaction_date.slice(0, 7) === refMonth);

export const getSavingsRate = (income: number, expenses: number) =>
  income > 0 ? ((income - expenses) / income) * 100 : 0;

const monthsThroughDeadline = (refMonth: string, deadline: string) => {
  const [refYear, refMonthNumber] = refMonth.split("-").map(Number);
  const [deadlineYear, deadlineMonth] = deadline.slice(0, 7).split("-").map(Number);
  const difference = (deadlineYear - refYear) * 12 + (deadlineMonth - refMonthNumber);
  return Math.max(difference, 1);
};

export const getGoalMonthlyRequirement = (goal: PlanningGoal, refMonth: string) => {
  if (goal.is_completed) return 0;
  const remaining = Math.max(Number(goal.target_amount) - Number(goal.current_amount), 0);
  if (remaining <= 0) return 0;
  const explicitTarget = Number(goal.monthly_target || 0);
  if (explicitTarget > 0) return Math.min(explicitTarget, remaining);
  if (goal.deadline) return remaining / monthsThroughDeadline(refMonth, goal.deadline);
  return 0;
};

export const getSavingsPlan = ({
  income,
  expenses,
  goals,
  refMonth,
}: {
  income: number;
  expenses: number;
  goals: PlanningGoal[];
  refMonth: string;
}) => {
  const surplus = income - expenses;
  const positiveSurplus = Math.max(surplus, 0);
  const baselineTarget = income > 0 ? income * 0.2 : 0;
  const goalsTarget = goals.reduce(
    (sum, goal) => sum + getGoalMonthlyRequirement(goal, refMonth),
    0,
  );
  const monthlyTarget = Math.max(baselineTarget, goalsTarget);
  const gap = Math.max(monthlyTarget - positiveSurplus, 0);
  const achievement = monthlyTarget > 0 ? (positiveSurplus / monthlyTarget) * 100 : 100;
  const status = surplus < 0 ? "critical" : achievement >= 100 ? "good" : achievement >= 70 ? "attention" : "critical";

  return {
    surplus,
    positiveSurplus,
    savingsRate: getSavingsRate(income, expenses),
    baselineTarget,
    goalsTarget,
    monthlyTarget,
    gap,
    achievement,
    status: status as "good" | "attention" | "critical",
  };
};

export const buildCategoryMovements = (
  currentTransactions: FinanceTx[],
  previousTransactions: FinanceTx[],
): CategoryMovement[] => {
  const grouped = new Map<string, Omit<CategoryMovement, "delta" | "percentChange" | "share">>();

  const add = (transaction: FinanceTx, field: "current" | "previous") => {
    if (transaction.type !== "expense" || transaction.status === "canceled") return;
    const id = transaction.category_id || "uncategorized";
    const existing = grouped.get(id) || {
      id,
      label: transaction.categories?.name || "Sem categoria",
      color: transaction.categories?.color || "#94A3B8",
      current: 0,
      previous: 0,
    };
    existing[field] += Number(transaction.amount);
    grouped.set(id, existing);
  };

  currentTransactions.forEach((transaction) => add(transaction, "current"));
  previousTransactions.forEach((transaction) => add(transaction, "previous"));
  const currentTotal = [...grouped.values()].reduce((sum, item) => sum + item.current, 0);

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      delta: item.current - item.previous,
      percentChange: item.previous > 0
        ? ((item.current - item.previous) / item.previous) * 100
        : item.current > 0 ? null : 0,
      share: currentTotal > 0 ? (item.current / currentTotal) * 100 : 0,
    }))
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
};

export const getReductionOpportunities = (movements: CategoryMovement[], savingsGap: number) => {
  const relevant = movements
    .filter((movement) => movement.current > 0)
    .filter((movement) => DISCRETIONARY_TERMS.some((term) => normalize(movement.label).includes(term)));

  return relevant
    .map((movement) => {
      const increaseBased = Math.max(movement.delta, 0) * 0.5;
      const recurringBased = movement.current * 0.1;
      const potential = Math.min(
        Math.max(increaseBased, recurringBased),
        savingsGap > 0 ? savingsGap : movement.current,
      );
      return { ...movement, potential };
    })
    .filter((movement) => movement.potential > 0)
    .sort((left, right) => right.potential - left.potential)
    .slice(0, 3);
};
