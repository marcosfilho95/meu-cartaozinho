import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  detectInstallment,
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

const LINE_PATTERN = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?\s*R?\$?\s*[\d.]*\d,\d{2})\s*$/;
const CARD_PATTERN = /Picpay\s*Card.*final\s*(\d{3,4})/i;
const CLOSING_PATTERN = /Fechamento[:\s]+(\d{2})[/-](\d{2})[/-](\d{4})/i;

const isNoise = (description: string) => {
  const upper = description.toUpperCase();
  return (
    upper.includes("PAGAMENTO DE FATURA") ||
    upper.includes("SUBTOTAL DOS LANCAMENTOS") ||
    upper.includes("TOTAL GERAL DOS LANCAMENTOS")
  );
};

export const picpayPdfParser: FinancialFileParser = {
  name: "picpay-pdf",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const text = context.fileText;
    const hasBrand = /picpay/i.test(text) && /(mastercard|picpay\s*card|fechamento)/i.test(text);
    const isPdf = /\.pdf$/i.test(context.fileName) || context.mimeType?.includes("pdf");
    const confidence = hasBrand ? (isPdf ? 0.9 : 0.7) : 0;
    return {
      confidence,
      institution: hasBrand ? "PICPAY" : "UNKNOWN",
      documentType: "CREDIT_CARD_STATEMENT",
      format: "PDF_TEXT",
      reason: hasBrand ? "Fatura PicPay detectada." : "Sem indícios de fatura PicPay.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const text = context.fileText;
    const closing = text.match(CLOSING_PATTERN);
    const closingMonth = closing ? Number(closing[2]) : new Date().getMonth() + 1;
    const closingYear = closing ? Number(closing[3]) : new Date().getFullYear();

    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];
    let currentCardEnd: string | undefined;

    const lines = text.split(/\r?\n/).map((l) => l.trim());
    for (const line of lines) {
      if (!line) continue;
      const card = line.match(CARD_PATTERN);
      if (card) {
        currentCardEnd = card[1];
        continue;
      }
      const match = line.match(LINE_PATTERN);
      if (!match) continue;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const rawDesc = match[3].trim();
      if (isNoise(rawDesc)) continue;
      // Year rule: months > closingMonth belong to previous year.
      const year = month > closingMonth ? closingYear - 1 : closingYear;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      let signed: number;
      try {
        signed = Number(parseBrazilianMoney(match[4]));
      } catch {
        continue;
      }
      if (!Number.isFinite(signed) || signed === 0) continue;
      const direction: "CREDIT" | "DEBIT" = signed < 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signed).toFixed(2);

      const installmentMatch = rawDesc.match(/PARC\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
      let cleanedDesc = rawDesc;
      let installmentCurrent: number | undefined;
      let installmentTotal: number | undefined;
      if (installmentMatch) {
        installmentCurrent = Number(installmentMatch[1]);
        installmentTotal = Number(installmentMatch[2]);
        cleanedDesc = rawDesc.replace(installmentMatch[0], "").trim();
      } else {
        const parsed = detectInstallment(rawDesc);
        installmentCurrent = parsed.installmentCurrent;
        installmentTotal = parsed.installmentTotal;
        cleanedDesc = parsed.normalizedDescription;
      }

      const normalized = normalizeMerchantName(cleanedDesc);
      const fingerprint = await getTransactionFingerprint({
        institution: "PICPAY",
        accountHint: currentCardEnd,
        transactionDate: date,
        amount,
        descriptionNormalized: normalized,
        direction,
        installmentCurrent,
        installmentTotal,
      });

      transactions.push({
        institution: "PICPAY",
        sourceType: "CREDIT_CARD",
        transactionDate: date,
        descriptionOriginal: rawDesc,
        descriptionNormalized: normalized,
        merchantName: normalized,
        amount,
        direction,
        installmentCurrent,
        installmentTotal,
        currency: "BRL",
        confidence: 0.85,
        categorySuggestion: suggestCategoryName(cleanedDesc, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(cleanedDesc),
        metadata: { parser: "picpay-pdf", cardEnd: currentCardEnd },
      });
    }

    if (transactions.length === 0) {
      warnings.push("Nenhuma transação reconhecida na fatura PicPay. Confira se o PDF tem texto (não é imagem).");
    }

    return {
      parserName: this.name,
      detection,
      period: closing ? { end: `${closing[3]}-${closing[2]}-${closing[1]}` } : undefined,
      transactions,
      warnings,
      metadata: { fileName: context.fileName, fileHash: context.fileHash, closingDate: closing?.[0] },
    };
  },
};