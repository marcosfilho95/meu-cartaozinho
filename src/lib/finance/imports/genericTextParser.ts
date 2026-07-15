import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

const LINE_PATTERN = /^(\d{2}[/-]\d{2}[/-]\d{2,4})\s+(.+?)\s+(-?\s*R?\$?\s*[\d.,]+)\s*$/;

const parseFlexibleDate = (raw: string): string | null => {
  const match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

export const genericTextParser: FinancialFileParser = {
  name: "generic-text",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const lines = context.fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { confidence: 0, institution: "UNKNOWN", documentType: "UNKNOWN", format: "TXT", reason: "vazio" };
    const matches = lines.filter((l) => LINE_PATTERN.test(l.trim())).length;
    const ratio = matches / Math.max(lines.length, 1);
    return {
      confidence: Math.min(ratio * 0.9, 0.6),
      institution: "UNKNOWN",
      documentType: "BANK_STATEMENT",
      format: "TXT",
      reason: matches > 0 ? `${matches} linhas em formato "data descrição valor".` : "Nenhuma linha reconhecida.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];
    const lines = context.fileText.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(LINE_PATTERN);
      if (!match) continue;
      const date = parseFlexibleDate(match[1]);
      if (!date) continue;
      const original = match[2].trim();
      let signed: number;
      try { signed = Number(parseBrazilianMoney(match[3])); } catch { continue; }
      if (!Number.isFinite(signed) || signed === 0) continue;
      const direction: "CREDIT" | "DEBIT" = signed >= 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signed).toFixed(2);
      const normalized = normalizeMerchantName(original);
      const fingerprint = await getTransactionFingerprint({
        institution: "UNKNOWN",
        transactionDate: date,
        amount,
        descriptionNormalized: normalized,
        direction,
      });

      transactions.push({
        institution: "UNKNOWN",
        sourceType: "BANK_ACCOUNT",
        transactionDate: date,
        descriptionOriginal: original,
        descriptionNormalized: normalized,
        merchantName: normalized,
        amount,
        direction,
        currency: "BRL",
        confidence: 0.65,
        categorySuggestion: suggestCategoryName(original, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(original),
        metadata: { parser: "generic-text" },
      });
    }

    if (transactions.length === 0) warnings.push("Não consegui identificar linhas no formato 'data descrição valor'.");

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      metadata: { fileName: context.fileName, fileHash: context.fileHash },
    };
  },
};