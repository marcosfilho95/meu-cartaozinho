import type {
  FinancialDocumentType,
  InstitutionCode,
  NormalizedTransaction,
  ParsedFinancialDocument,
  TransactionDirection,
} from "./types";
import { classifyFinancialRow } from "./financialRules";
import { getTransactionFingerprint, isLikelyInternalTransfer, normalizeMerchantName } from "./utils";

export type VisionTransaction = {
  external_id?: string | null;
  description_original?: string;
  merchant_name?: string | null;
  amount?: number;
  direction?: TransactionDirection;
  transaction_date?: string;
  posting_date?: string | null;
  due_date?: string | null;
  statement_month?: string | null;
  competence_month?: string | null;
  source_type?: "BANK_ACCOUNT" | "CREDIT_CARD";
  card_last4?: string | null;
  installment_current?: number | null;
  installment_total?: number | null;
  category_hint?: string | null;
  confidence?: number;
  reason?: string;
  needs_review?: boolean;
  page_number?: number;
};

export type VisionBatchResult = {
  institution?: InstitutionCode;
  document_type?: FinancialDocumentType;
  due_date?: string | null;
  statement_month?: string | null;
  totals?: {
    total_credits?: number | null;
    total_debits?: number | null;
    statement_total?: number | null;
  };
  warnings?: string[];
  transactions?: VisionTransaction[];
};

const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const validMonth = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : undefined;

export const buildVisionDocument = async (
  batches: VisionBatchResult[],
  input: { fileName: string; fileHash: string; format: "PDF_IMAGE" | "IMAGE" },
): Promise<ParsedFinancialDocument> => {
  const institution = batches.find((b) => b.institution && b.institution !== "UNKNOWN")?.institution || "UNKNOWN";
  const documentType = batches.find((b) => b.document_type && b.document_type !== "UNKNOWN")?.document_type || "UNKNOWN";
  const defaultDueDate = validDate(batches.find((b) => b.due_date)?.due_date);
  const defaultStatementMonth = validMonth(batches.find((b) => b.statement_month)?.statement_month);
  const transactions: NormalizedTransaction[] = [];
  const seenExternalIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const raw of batches.flatMap((batch) => batch.transactions || [])) {
    const date = validDate(raw.transaction_date) || validDate(raw.posting_date);
    const amountNumber = Math.abs(Number(raw.amount));
    const original = String(raw.description_original || "").trim();
    if (!date || !original || !Number.isFinite(amountNumber) || amountNumber <= 0) continue;
    const direction: TransactionDirection = raw.direction === "CREDIT" ? "CREDIT" : "DEBIT";
    const sourceType = raw.source_type || (documentType === "CREDIT_CARD_STATEMENT" ? "CREDIT_CARD" : "BANK_ACCOUNT");
    const normalized = normalizeMerchantName(raw.merchant_name || original);
    const fingerprint = await getTransactionFingerprint({
      institution,
      accountHint: raw.card_last4 || undefined,
      transactionDate: date,
      amount: amountNumber.toFixed(2),
      descriptionNormalized: normalized,
      direction,
      installmentCurrent: raw.installment_current || undefined,
      installmentTotal: raw.installment_total || undefined,
    });
    if (raw.external_id && seenExternalIds.has(raw.external_id)) continue;
    if (raw.external_id) seenExternalIds.add(raw.external_id);
    const repeatedFingerprint = seenFingerprints.has(fingerprint);
    seenFingerprints.add(fingerprint);

    const base: NormalizedTransaction = {
      externalId: raw.external_id ? `${institution}:${raw.card_last4 || "default"}:${raw.external_id}` : undefined,
      institution,
      sourceType,
      sourceAccountId: raw.card_last4 || undefined,
      transactionDate: date,
      postingDate: validDate(raw.posting_date),
      dueDate: validDate(raw.due_date) || defaultDueDate,
      statementMonth: validMonth(raw.statement_month) || defaultStatementMonth,
      competenceMonth: validMonth(raw.competence_month) || date.slice(0, 7),
      descriptionOriginal: original,
      descriptionNormalized: normalized,
      merchantName: raw.merchant_name || normalized,
      amount: amountNumber.toFixed(2),
      direction,
      installmentCurrent: raw.installment_current || undefined,
      installmentTotal: raw.installment_total || undefined,
      currency: "BRL",
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.6)),
      pageNumber: raw.page_number,
      classificationReason: raw.reason || undefined,
      classificationSource: "ai",
      needsReview: Boolean(raw.needs_review) || Number(raw.confidence) < 0.7 || repeatedFingerprint,
      categorySuggestion: raw.category_hint || undefined,
      fingerprint,
      possibleDuplicate: repeatedFingerprint,
      possibleInternalTransfer: isLikelyInternalTransfer(original),
      metadata: { parser: "vision", pageNumber: raw.page_number, aiReason: raw.reason || null },
    };
    const rule = classifyFinancialRow(base);
    transactions.push({
      ...base,
      possibleInternalTransfer: rule.type === "transfer" || base.possibleInternalTransfer,
      classificationReason: rule.reason,
      classificationSource: "rule",
      needsReview: base.needsReview || rule.needsReview || repeatedFingerprint,
      categorySuggestion: rule.categoryHint || base.categorySuggestion,
      metadata: { ...base.metadata, financialRole: rule.role, financialType: rule.type, negativeAmount: rule.negativeAmount },
    });
  }

  const totalSource = batches.find((b) => b.totals && Object.values(b.totals).some((value) => value != null))?.totals;
  return {
    parserName: "financial-document-vision",
    detection: {
      confidence: transactions.length > 0 ? Math.min(0.95, transactions.reduce((sum, tx) => sum + tx.confidence, 0) / transactions.length) : 0,
      institution,
      documentType,
      format: input.format,
      reason: input.format === "PDF_IMAGE" ? "PDF escaneado lido por visão." : "Imagem lida por visão.",
    },
    totals: totalSource ? {
      totalCredits: totalSource.total_credits != null ? String(totalSource.total_credits) : undefined,
      totalDebits: totalSource.total_debits != null ? String(totalSource.total_debits) : undefined,
      statementTotal: totalSource.statement_total != null ? String(totalSource.statement_total) : undefined,
    } : undefined,
    transactions,
    warnings: batches.flatMap((b) => b.warnings || []),
    metadata: { fileName: input.fileName, fileHash: input.fileHash, batches: batches.length },
  };
};
