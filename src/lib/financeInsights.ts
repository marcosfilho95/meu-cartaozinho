/**
 * Motor determinístico de inteligência financeira.
 *
 * Todas as funções aqui são puras e trabalham em centavos internamente para
 * evitar erros de ponto flutuante. Nenhuma frase é genérica: cada orientação
 * é derivada de um número real calculado a partir dos lançamentos do usuário.
 */
import type { FinanceTx } from "@/lib/financeShared";
import { addMonthsToKey, getMonthLabel } from "@/lib/financeShared";
import { getTransactionReferenceMonth } from "@/lib/financeOverview";
import { shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";

export const toCents = (value: number | string | null | undefined) =>
  Math.round((Number(value) || 0) * 100);

export const fromCents = (cents: number) => cents / 100;

/** Categorias tipicamente fixas quando não há recorrência cadastrada. */
const FIXED_CATEGORY_HINTS = [
  "moradia",
  "aluguel",
  "condominio",
  "internet",
  "assinatura",
  "assinaturas",
  "educacao",
  "plano de saude",
  "energia",
  "agua",
];

const normalize = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const isFixedExpense = (tx: FinanceTx) => {
  if (tx.recurrence_id) return true;
  const category = normalize(tx.categories?.name || "");
  if (!category) return false;
  return FIXED_CATEGORY_HINTS.some((hint) => category.includes(hint));
};

const countable = (tx: FinanceTx) =>
  tx.status !== "canceled" && tx.type !== "transfer" && shouldIncludeInRealizedCalculations(tx);

export type MonthSummary = {
  month: string;
  income: number;
  expenses: number;
  result: number;
  fixedExpenses: number;
  variableExpenses: number;
  /** % da renda comprometida com despesas. */
  committedRate: number;
  /** % da renda que sobrou (taxa de economia). */
  savingsRate: number;
  transactions: number;
  hasData: boolean;
};

export const summarizeMonth = (transactions: FinanceTx[], refMonth: string): MonthSummary => {
  let incomeC = 0;
  let expenseC = 0;
  let fixedC = 0;
  let count = 0;

  transactions.forEach((tx) => {
    if (!countable(tx)) return;
    if (getTransactionReferenceMonth(tx) !== refMonth) return;
    count += 1;
    const cents = toCents(tx.amount);
    if (tx.type === "income") {
      incomeC += cents;
      return;
    }
    expenseC += cents;
    if (isFixedExpense(tx)) fixedC += cents;
  });

  const resultC = incomeC - expenseC;
  return {
    month: refMonth,
    income: fromCents(incomeC),
    expenses: fromCents(expenseC),
    result: fromCents(resultC),
    fixedExpenses: fromCents(fixedC),
    variableExpenses: fromCents(expenseC - fixedC),
    committedRate: incomeC > 0 ? (expenseC / incomeC) * 100 : 0,
    savingsRate: incomeC > 0 ? (resultC / incomeC) * 100 : 0,
    transactions: count,
    hasData: count > 0,
  };
};

export type MonthComparison = {
  expensesDelta: number;
  expensesDeltaPct: number;
  incomeDelta: number;
  resultDelta: number;
  averageExpenses: number;
  averageIncome: number;
  monthsWithData: number;
};

export const compareMonths = (
  transactions: FinanceTx[],
  refMonth: string,
  historyMonths = 3,
): MonthComparison => {
  const current = summarizeMonth(transactions, refMonth);
  const previous = summarizeMonth(transactions, addMonthsToKey(refMonth, -1));

  const history: MonthSummary[] = [];
  for (let i = 1; i <= historyMonths; i += 1) {
    history.push(summarizeMonth(transactions, addMonthsToKey(refMonth, -i)));
  }
  const withData = history.filter((item) => item.hasData);
  const average = (pick: (item: MonthSummary) => number) =>
    withData.length ? withData.reduce((sum, item) => sum + pick(item), 0) / withData.length : 0;

  const expensesDelta = current.expenses - previous.expenses;
  return {
    expensesDelta,
    expensesDeltaPct: previous.expenses > 0 ? (expensesDelta / previous.expenses) * 100 : 0,
    incomeDelta: current.income - previous.income,
    resultDelta: current.result - previous.result,
    averageExpenses: average((item) => item.expenses),
    averageIncome: average((item) => item.income),
    monthsWithData: withData.length,
  };
};

export type CategoryTrend = {
  categoryId: string;
  name: string;
  color: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
};

export const buildCategoryTrends = (
  transactions: FinanceTx[],
  refMonth: string,
  fallbackColor = "#94A3B8",
): CategoryTrend[] => {
  const previousMonth = addMonthsToKey(refMonth, -1);
  const map = new Map<string, CategoryTrend>();

  transactions.forEach((tx) => {
    if (!countable(tx) || tx.type !== "expense") return;
    const month = getTransactionReferenceMonth(tx);
    if (month !== refMonth && month !== previousMonth) return;
    const key = tx.category_id || "sem-categoria";
    const entry =
      map.get(key) ||
      {
        categoryId: key,
        name: tx.categories?.name || "Sem categoria",
        color: tx.categories?.color || fallbackColor,
        current: 0,
        previous: 0,
        delta: 0,
        deltaPct: 0,
      };
    if (month === refMonth) entry.current += fromCents(toCents(tx.amount));
    else entry.previous += fromCents(toCents(tx.amount));
    map.set(key, entry);
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      delta: entry.current - entry.previous,
      deltaPct: entry.previous > 0 ? ((entry.current - entry.previous) / entry.previous) * 100 : 0,
    }))
    .sort((a, b) => b.current - a.current);
};

/** Agrupa categorias pequenas em "Outros" para os gráficos. */
export const groupSmallSlices = <T extends { name: string; value: number; color: string }>(
  items: T[],
  options: { maxItems?: number; minPercentage?: number } = {},
) => {
  const { maxItems = 6, minPercentage = 4 } = options;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [] as Array<{ name: string; value: number; color: string }>;

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const main: Array<{ name: string; value: number; color: string }> = [];
  let othersValue = 0;

  sorted.forEach((item, index) => {
    const pct = (item.value / total) * 100;
    if (index < maxItems && pct >= minPercentage) {
      main.push({ name: item.name, value: item.value, color: item.color });
      return;
    }
    othersValue += item.value;
  });

  if (othersValue > 0) main.push({ name: "Outros", value: othersValue, color: "#94A3B8" });
  return main;
};

export type GoalProjection = {
  id: string;
  name: string;
  target: number;
  saved: number;
  missing: number;
  progress: number;
  /** Meses estimados para concluir com a reserva média mensal. */
  monthsToFinish: number | null;
  estimatedMonth: string | null;
};

export const projectGoal = (
  goal: { id: string; name: string; target_amount: number | string; current_amount: number | string },
  monthlyReserve: number,
  baseMonth: string,
): GoalProjection => {
  const target = fromCents(toCents(goal.target_amount));
  const saved = fromCents(toCents(goal.current_amount));
  const missing = Math.max(target - saved, 0);
  const monthsToFinish = missing <= 0 ? 0 : monthlyReserve > 0 ? Math.ceil(missing / monthlyReserve) : null;
  return {
    id: goal.id,
    name: goal.name,
    target,
    saved,
    missing,
    progress: target > 0 ? Math.min((saved / target) * 100, 100) : 0,
    monthsToFinish,
    estimatedMonth: monthsToFinish === null ? null : addMonthsToKey(baseMonth, monthsToFinish),
  };
};

export type Insight = {
  id: string;
  tone: "positive" | "neutral" | "attention";
  text: string;
};

const pct = (value: number) => `${Math.abs(value).toFixed(0)}%`;
const brl = (value: number) =>
  Math.abs(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthName = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });

/**
 * Gera orientações objetivas a partir dos números calculados.
 * Nunca inventa valores: se não houver histórico, devolve o aviso de coleta.
 */
export const buildInsights = (params: {
  refMonth: string;
  summary: MonthSummary;
  comparison: MonthComparison;
  categoryTrends?: CategoryTrend[];
  spendingGoal?: number | null;
  reservedForPlans?: number;
  goalProjections?: GoalProjection[];
}): Insight[] => {
  const {
    refMonth,
    summary,
    comparison,
    categoryTrends = [],
    spendingGoal,
    reservedForPlans = 0,
    goalProjections = [],
  } = params;

  if (!summary.hasData && comparison.monthsWithData === 0) {
    return [
      {
        id: "no-data",
        tone: "neutral",
        text: "Continue registrando seus meses. Após dois ou três fechamentos, você verá comparações e sugestões mais precisas.",
      },
    ];
  }

  const insights: Insight[] = [];

  if (comparison.expensesDeltaPct !== 0 && Math.abs(comparison.expensesDeltaPct) >= 1) {
    insights.push({
      id: "expenses-delta",
      tone: comparison.expensesDelta > 0 ? "attention" : "positive",
      text: `Seus gastos ficaram ${pct(comparison.expensesDeltaPct)} ${
        comparison.expensesDelta > 0 ? "maiores" : "menores"
      } que no mês anterior (${brl(comparison.expensesDelta)}).`,
    });
  }

  if (summary.income > 0) {
    const reservedRate = (reservedForPlans / summary.income) * 100;
    insights.push({
      id: "committed",
      tone: summary.committedRate > 90 ? "attention" : "neutral",
      text: `Você comprometeu ${pct(summary.committedRate)} da renda e reservou ${pct(
        reservedRate,
      )} para seus planos.`,
    });
  }

  const rising = categoryTrends.find((item) => item.previous > 0 && item.deltaPct >= 20 && item.current > 0);
  if (rising) {
    insights.push({
      id: `category-${rising.categoryId}`,
      tone: "attention",
      text: `${rising.name} subiu ${pct(rising.deltaPct)} em relação ao mês anterior (${brl(rising.delta)} a mais).`,
    });
  }

  if (spendingGoal && spendingGoal > 0) {
    const diff = summary.expenses - spendingGoal;
    insights.push({
      id: "spending-goal",
      tone: diff > 0 ? "attention" : "positive",
      text:
        diff > 0
          ? `Para limitar os gastos a ${brl(spendingGoal)}, será necessário reduzir aproximadamente ${brl(
              diff,
            )} no próximo mês.`
          : `Você ficou ${brl(diff)} abaixo da meta de ${brl(spendingGoal)} neste mês.`,
    });
  }

  const projection = goalProjections.find((goal) => goal.missing > 0 && goal.estimatedMonth);
  if (projection && reservedForPlans > 0) {
    insights.push({
      id: `goal-${projection.id}`,
      tone: "positive",
      text: `Mantendo uma reserva de ${brl(reservedForPlans)} por mês, ${projection.name} poderá ser concluída em ${monthName(
        projection.estimatedMonth!,
      )}.`,
    });
  }

  if (comparison.monthsWithData >= 1 && comparison.averageExpenses > 0) {
    const diff = summary.expenses - comparison.averageExpenses;
    insights.push({
      id: "average",
      tone: diff > 0 ? "attention" : "positive",
      text: `A média dos últimos ${comparison.monthsWithData} ${
        comparison.monthsWithData === 1 ? "mês" : "meses"
      } é ${brl(comparison.averageExpenses)}; ${monthName(refMonth)} está ${brl(diff)} ${
        diff > 0 ? "acima" : "abaixo"
      }.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "keep-going",
      tone: "neutral",
      text: "Continue registrando seus meses. Após dois ou três fechamentos, você verá comparações e sugestões mais precisas.",
    });
  }

  return insights.slice(0, 4);
};

export const monthTitle = (key: string) => {
  const label = new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const shortMonthTitle = (key: string) => getMonthLabel(key);
