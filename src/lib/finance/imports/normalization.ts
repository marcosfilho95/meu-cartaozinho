import type { FinancialDocumentType, TransactionDirection } from "./types";
import { normalizeText } from "./utils";

const CARD_CREDIT_TERMS = [
  "PAGAMENTO RECEBIDO",
  "PAGAMENTO DE FATURA",
  "PAGAMENTO FATURA",
  "PGTO FATURA",
  "PAGTO FATURA",
  "ESTORNO",
  "REEMBOLSO",
  "DEVOLUCAO",
  "CANCELAMENTO DE COMPRA",
  "CHARGEBACK",
  "AJUSTE A CREDITO",
  "CREDITO NA FATURA",
];

const isValidDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const formatDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const inferReferenceYear = (referenceText: string, statementMonth?: string) => {
  const forcedYear = statementMonth?.match(/^(\d{4})-\d{2}$/)?.[1];
  if (forcedYear) return Number(forcedYear);

  const isoYear = referenceText.match(/\b(20\d{2})-\d{2}-\d{2}\b/)?.[1];
  if (isoYear) return Number(isoYear);

  const datedYear = referenceText.match(/\b\d{2}[/-]\d{2}[/-](20\d{2})\b/)?.[1];
  if (datedYear) return Number(datedYear);

  const anyYear = referenceText.match(/\b(20\d{2})\b/)?.[1];
  return anyYear ? Number(anyYear) : new Date().getFullYear();
};

/** Normaliza datas de importação; MM-DD só é aceito em faturas de cartão. */
export const parseImportDate = (
  raw: string,
  input: { documentType: FinancialDocumentType; statementMonth?: string; referenceText?: string },
): string | null => {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDate(year, month, day) ? formatDate(year, month, day) : null;
  }

  const complete = value.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (complete) {
    const year = Number(complete[3].length === 2 ? `20${complete[3]}` : complete[3]);
    const month = Number(complete[2]);
    const day = Number(complete[1]);
    return isValidDate(year, month, day) ? formatDate(year, month, day) : null;
  }

  if (input.documentType !== "CREDIT_CARD_STATEMENT") return null;
  const shortCardDate = value.match(/^(\d{2})-(\d{2})$/);
  if (!shortCardDate) return null;

  const month = Number(shortCardDate[1]);
  const day = Number(shortCardDate[2]);
  let year = inferReferenceYear(input.referenceText || "", input.statementMonth);
  const statementMonthNumber = Number(input.statementMonth?.slice(5, 7));
  if (statementMonthNumber >= 1 && statementMonthNumber <= 12 && month > statementMonthNumber) year -= 1;
  return isValidDate(year, month, day) ? formatDate(year, month, day) : null;
};

export const isExplicitCardCredit = (description: string) => {
  const normalized = normalizeText(description);
  return CARD_CREDIT_TERMS.some((term) => normalized.includes(term));
};

/** Em fatura, valor positivo em coluna única é compra/débito, não receita. */
export const normalizeCardStatementDirection = (input: {
  description: string;
  signedAmount?: number;
  proposedDirection?: TransactionDirection;
  hasExplicitDirectionColumns?: boolean;
}): TransactionDirection => {
  if (isExplicitCardCredit(input.description)) return "CREDIT";
  if (input.hasExplicitDirectionColumns && input.proposedDirection) return input.proposedDirection;
  if (typeof input.signedAmount === "number" && input.signedAmount < 0) return "CREDIT";
  return "DEBIT";
};
