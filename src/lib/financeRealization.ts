import type { FinanceTx } from "@/lib/financeShared";

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type RealizationTx = Pick<FinanceTx, "status"> &
  Partial<Pick<FinanceTx, "recurrence_id" | "competence_month" | "transaction_date">>;

/** Retorna a competência do mês local, sem converter para UTC. */
export const getLocalYearMonth = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** Resolve a competência do lançamento comparando somente ano e mês. */
export const getTransactionCompetenceMonth = (
  transaction: Pick<FinanceTx, "transaction_date"> & Partial<Pick<FinanceTx, "competence_month">>,
) => {
  const competence = transaction.competence_month?.slice(0, 7) || transaction.transaction_date?.slice(0, 7) || "";
  return YEAR_MONTH_PATTERN.test(competence) ? competence : "";
};

/**
 * Uma recorrência já marcada como realizada só produz efeito até o mês local atual.
 * O dia é deliberadamente ignorado: toda a competência atual já é considerada.
 */
export const shouldIncludeInRealizedCalculations = (
  transaction: RealizationTx,
  currentDate = new Date(),
) => {
  if (transaction.status !== "paid" || !transaction.recurrence_id) return true;
  const competence = getTransactionCompetenceMonth({
    competence_month: transaction.competence_month,
    transaction_date: transaction.transaction_date || "",
  });
  return Boolean(competence) && competence <= getLocalYearMonth(currentDate);
};
