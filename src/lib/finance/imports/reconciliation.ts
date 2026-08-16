import { NormalizedTransaction } from "./types";
import { classifyFinancialRow } from "./financialRules";

export type DocumentTotals = {
  totalCredits?: string | number | null;
  totalDebits?: string | number | null;
  statementTotal?: string | number | null;
};

export type ReconciliationLine = {
  label: string;
  expected: number;
  found: number;
  difference: number;
  ok: boolean;
  message: string;
};

export type ReconciliationReport = {
  hasTotals: boolean;
  ok: boolean;
  lines: ReconciliationLine[];
};

const TOLERANCE = 0.01;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.abs(n) : null;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const buildLine = (label: string, expected: number, found: number): ReconciliationLine => {
  const difference = Number((expected - found).toFixed(2));
  const ok = Math.abs(difference) <= TOLERANCE;
  return {
    label,
    expected,
    found,
    difference,
    ok,
    message: ok
      ? `${label}: ${money(expected)} conferem com as transações reconhecidas.`
      : `${label}: ${money(expected)}. Transações reconhecidas: ${money(found)}. ${
          difference > 0 ? `Faltam ${money(difference)} para reconciliar.` : `Excedem ${money(Math.abs(difference))}.`
        }`,
  };
};

/**
 * Compara os totais impressos no documento com a soma das linhas extraídas.
 * Estornos e pagamentos de fatura são considerados separadamente.
 */
export const reconcileDocument = (
  transactions: NormalizedTransaction[],
  totals: DocumentTotals | undefined | null,
): ReconciliationReport => {
  const expectedCredits = toNumber(totals?.totalCredits);
  const expectedDebits = toNumber(totals?.totalDebits);
  const expectedStatement = toNumber(totals?.statementTotal);

  if (expectedCredits === null && expectedDebits === null && expectedStatement === null) {
    return { hasTotals: false, ok: true, lines: [] };
  }

  let credits = 0;
  let debits = 0;
  let purchases = 0;

  for (const tx of transactions) {
    const amount = Math.abs(Number(tx.amount));
    if (!Number.isFinite(amount)) continue;
    const classification = classifyFinancialRow(tx);
    if (tx.direction === "CREDIT") credits += amount;
    else debits += amount;
    if (classification.role === "card_purchase") purchases += amount;
    if (classification.role === "refund") purchases -= amount;
  }

  const lines: ReconciliationLine[] = [];
  if (expectedCredits !== null) lines.push(buildLine("Total de créditos", expectedCredits, Number(credits.toFixed(2))));
  if (expectedDebits !== null) lines.push(buildLine("Total de débitos", expectedDebits, Number(debits.toFixed(2))));
  if (expectedStatement !== null) lines.push(buildLine("Total da fatura", expectedStatement, Number(purchases.toFixed(2))));

  return { hasTotals: lines.length > 0, ok: lines.every((l) => l.ok), lines };
};