import type { FinanceTx } from "@/lib/financeShared";
import { getTransactionCompetenceMonth, shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";

export type NetWorthAccount = {
  type: string;
  current_balance?: number | null;
  include_in_net_worth?: boolean | null;
};

export type GoalBalance = {
  current_amount?: number | null;
};

export type GoalMovement = {
  amount: number;
  type: string;
  ref_month?: string | null;
  created_at?: string | null;
};

export type NetWorthSummary = {
  assets: number;
  goals: number;
  debts: number;
  total: number;
};

export type MonthlyResult = {
  income: number;
  expenses: number;
  result: number;
  paidIncome: number;
  paidExpenses: number;
  paidResult: number;
  pendingIncome: number;
  pendingExpenses: number;
};

export type ReserveMovementSummary = {
  deposits: number;
  withdrawals: number;
  net: number;
};

const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

const amount = (value: number | null | undefined) => Number(value) || 0;

/** Efeito de um lançamento no saldo real da conta. Pendências e transferências não alteram o saldo aqui. */
export const calculateAccountBalanceEffect = (
  transaction: Pick<FinanceTx, "amount" | "type" | "status"> &
    Partial<Pick<FinanceTx, "recurrence_id" | "competence_month" | "transaction_date">>,
) => {
  if (transaction.status !== "paid") return 0;
  if (!shouldIncludeInRealizedCalculations(transaction)) return 0;
  if (transaction.type === "income") return amount(transaction.amount);
  if (transaction.type === "expense") return -amount(transaction.amount);
  return 0;
};

export const getTransactionReferenceMonth = (transaction: FinanceTx) =>
  getTransactionCompetenceMonth(transaction);

export const calculateNetWorth = (
  accounts: NetWorthAccount[],
  goals: GoalBalance[] = [],
): NetWorthSummary => {
  let assets = 0;
  let debts = 0;

  accounts.forEach((account) => {
    const balance = amount(account.current_balance);
    if (LIABILITY_TYPES.has(account.type)) {
      debts += Math.abs(balance);
      return;
    }
    if (!account.include_in_net_worth) return;
    if (balance >= 0) assets += balance;
    else debts += Math.abs(balance);
  });

  const goalsTotal = goals.reduce((sum, goal) => sum + Math.max(amount(goal.current_amount), 0), 0);

  return {
    assets,
    goals: goalsTotal,
    debts,
    total: assets + goalsTotal - debts,
  };
};

export const calculateMonthlyResult = (
  transactions: FinanceTx[],
  refMonth: string,
): MonthlyResult => {
  const monthTransactions = transactions.filter(
    (transaction) =>
      transaction.status !== "canceled" &&
      transaction.type !== "transfer" &&
      shouldIncludeInRealizedCalculations(transaction) &&
      getTransactionReferenceMonth(transaction) === refMonth,
  );

  const sum = (type: "income" | "expense", statuses?: FinanceTx["status"][]) =>
    monthTransactions
      .filter((transaction) => transaction.type === type && (!statuses || statuses.includes(transaction.status)))
      .reduce((total, transaction) => total + amount(transaction.amount), 0);

  const income = sum("income");
  const expenses = sum("expense");
  const paidIncome = sum("income", ["paid"]);
  const paidExpenses = sum("expense", ["paid"]);
  const pendingIncome = sum("income", ["pending", "overdue"]);
  const pendingExpenses = sum("expense", ["pending", "overdue"]);

  return {
    income,
    expenses,
    result: income - expenses,
    paidIncome,
    paidExpenses,
    paidResult: paidIncome - paidExpenses,
    pendingIncome,
    pendingExpenses,
  };
};

export const getGoalMovementMonth = (movement: GoalMovement) =>
  movement.ref_month || movement.created_at?.slice(0, 7) || "";

export const calculateReserveMovement = (
  movements: GoalMovement[],
  refMonth: string,
): ReserveMovementSummary => {
  const summary = movements.reduce(
    (result, movement) => {
      if (getGoalMovementMonth(movement) !== refMonth) return result;
      const movementAmount = Math.abs(amount(movement.amount));
      if (movement.type === "deposit") result.deposits += movementAmount;
      if (movement.type === "withdraw") result.withdrawals += movementAmount;
      return result;
    },
    { deposits: 0, withdrawals: 0 },
  );

  return {
    ...summary,
    net: summary.deposits - summary.withdrawals,
  };
};
