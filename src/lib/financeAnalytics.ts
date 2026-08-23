import type { FinanceTx } from "@/lib/financeShared";
import { BANK_COLORS, CATEGORY_COLORS, getMonthLabel, normalizeLabel } from "@/lib/financeShared";
import { calculateReserveMovement, getTransactionReferenceMonth, type GoalMovement } from "@/lib/financeOverview";
import { shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";

export type MonthPoint = {
  key: string;
  month: string;
  receitas: number;
  despesas: number;
  saldo: number;
  savingsRate: number;
  aportes: number;
  retiradas: number;
  reservaLiquida: number;
};

export type BreakdownItem = {
  key: string;
  name: string;
  value: number;
  color: string;
  percentage: number;
};

export type SavingsTrend = {
  current: number;
  previous: number;
  average: number;
  delta: number;
  direction: "saving" | "spending" | "stable";
  expensesDelta: number;
};

const isCountable = (tx: FinanceTx) =>
  tx.status !== "canceled" && tx.type !== "transfer" && shouldIncludeInRealizedCalculations(tx);

export const resolveAccountColor = (name: string, index: number) => {
  const normalized = normalizeLabel(name);
  const match = Object.keys(BANK_COLORS).find((bank) => normalized.includes(bank));
  return match ? BANK_COLORS[match] : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
};

export const buildMonthlyEvolution = (
  transactions: FinanceTx[],
  keys: string[],
  goalMovements: GoalMovement[] = [],
): MonthPoint[] => {
  const map = new Map<string, MonthPoint>(
    keys.map((key) => [
      key,
      {
        key,
        month: getMonthLabel(key),
        receitas: 0,
        despesas: 0,
        saldo: 0,
        savingsRate: 0,
        aportes: 0,
        retiradas: 0,
        reservaLiquida: 0,
      },
    ]),
  );

  transactions.forEach((tx) => {
    if (!isCountable(tx)) return;
    const point = map.get(getTransactionReferenceMonth(tx));
    if (!point) return;
    const amount = Number(tx.amount) || 0;
    if (tx.type === "income") point.receitas += amount;
    else point.despesas += amount;
  });

  return keys.map((key) => {
    const point = map.get(key)!;
    const saldo = point.receitas - point.despesas;
    const reserveMovement = calculateReserveMovement(goalMovements, key);
    return {
      ...point,
      saldo,
      savingsRate: point.receitas > 0 ? (saldo / point.receitas) * 100 : 0,
      aportes: reserveMovement.deposits,
      retiradas: reserveMovement.withdrawals,
      reservaLiquida: reserveMovement.net,
    };
  });
};

export const buildExpenseBreakdown = (
  transactions: FinanceTx[],
  dimension: "category" | "card",
  options: { months?: string[]; limit?: number } = {},
): BreakdownItem[] => {
  const { months, limit = 8 } = options;
  const monthSet = months ? new Set(months) : null;
  const map = new Map<string, BreakdownItem>();

  transactions.forEach((tx) => {
    if (!isCountable(tx) || tx.type !== "expense") return;
    if (monthSet && !monthSet.has(getTransactionReferenceMonth(tx))) return;
    if (dimension === "card" && tx.accounts?.type !== "credit_card") return;

    const key =
      dimension === "category"
        ? tx.category_id || "sem-categoria"
        : tx.account_id || "sem-cartao";
    const name =
      dimension === "category"
        ? tx.categories?.name || "Sem categoria"
        : tx.accounts?.name || "Sem cartão";

    const existing = map.get(key);
    if (existing) {
      existing.value += Number(tx.amount) || 0;
      return;
    }
    const color =
      dimension === "category"
        ? tx.categories?.color || CATEGORY_COLORS[map.size % CATEGORY_COLORS.length]
        : resolveAccountColor(name, map.size);
    map.set(key, { key, name, value: Number(tx.amount) || 0, color, percentage: 0 });
  });

  const items = Array.from(map.values()).filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items
    .map((item) => ({ ...item, percentage: total > 0 ? (item.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
};

export const buildSavingsTrend = (points: MonthPoint[]): SavingsTrend => {
  const current = points[points.length - 1];
  const previous = points[points.length - 2];
  const currentSaldo = current?.saldo ?? 0;
  const previousSaldo = previous?.saldo ?? 0;
  const average = points.length
    ? points.reduce((sum, point) => sum + point.saldo, 0) / points.length
    : 0;
  const delta = currentSaldo - previousSaldo;
  const direction: SavingsTrend["direction"] =
    Math.abs(delta) < 0.01 ? "stable" : delta > 0 ? "saving" : "spending";

  return {
    current: currentSaldo,
    previous: previousSaldo,
    average,
    delta,
    direction,
    expensesDelta: (current?.despesas ?? 0) - (previous?.despesas ?? 0),
  };
};
