import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  detectInstallment,
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

// Linhas típicas: "12 MAR IFOOD*RESTAURANTE 42,90"  ou  "12/03 IFOOD 42,90"
const LINE_MONTH_ABBR = /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+(-?\s*R?\$?\s*[\d.]*\d,\d{2})\s*$/i;
const LINE_SLASH = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?\s*R?\$?\s*[\d.]*\d,\d{2})\s*$/;
const CARD_END_PATTERN = /final(?:\s+do)?\s*cart[aã]o[:\s]+(\d{3,4})/i;
const DUE_PATTERN = /vencimento[:\s]+(\d{2})[/-](\d{2})[/-](\d{4})/i;

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const isNoise = (description: string) => {
  const up = description.toUpperCase();
  return (
    up.includes("PAGAMENTO RECEBIDO") ||
    up.includes("PAGAMENTO EM ") ||
    up.includes("TOTAL DA FATURA") ||
    up.includes("SALDO EM ABERTO") ||
    up.startsWith("SUBTOTAL")
  );
};

export const nubankPdfParser: FinancialFileParser = {
  name: "nubank-pdf",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const text = context.fileText || "";
    const hasBrand = /nubank|nu\s*pagamentos/i.test(text) && /(fatura|vencimento|cart[aã]o)/i.test(text);
    const isPdf = /\.pdf$/i.test(context.fileName) || (context.mimeType || "").includes("pdf");
    const confidence = hasBrand ? (isPdf ? 0.88 : 0.6) : 0;
    return {
      confidence,
      institution: hasBrand ? "NUBANK" : "UNKNOWN",
      documentType: "CREDIT_CARD_STATEMENT",
      format: "PDF_TEXT",
      reason: hasBrand ? "Fatura Nubank detectada." : "Sem indícios de fatura Nubank.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const text = context.fileText || "";
    const dueMatch = text.match(DUE_PATTERN);
    const dueMonth = dueMatch ? Number(dueMatch[2]) : new Date().getMonth() + 1;
    const dueYear = dueMatch ? Number(dueMatch[3]) : new Date().getFullYear();
    // Meses > mês de vencimento pertencem ao ano anterior (fatura fecha antes).
    const yearFor = (month: number) => (month > dueMonth ? dueYear - 1 : dueYear);

    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];
    let currentCardEnd: string | undefined;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const card = line.match(CARD_END_PATTERN);
      if (card) {
        currentCardEnd = card[1];
        continue;
      }

      let day = 0;
      let month = 0;
      let rawDesc = "";
      let rawAmount = "";

      const mAbbr = line.match(LINE_MONTH_ABBR);
      const mSlash = !mAbbr ? line.match(LINE_SLASH) : null;
      if (mAbbr) {
        day = Number(mAbbr[1]);
        month = MONTH_MAP[mAbbr[2].toUpperCase()] || 0;
        rawDesc = mAbbr[3].trim();
        rawAmount = mAbbr[4];
      } else if (mSlash) {
        day = Number(mSlash[1]);
        month = Number(mSlash[2]);
        rawDesc = mSlash[3].trim();
        rawAmount = mSlash[4];
      } else {
        continue;
      }

      if (!month || !day || isNoise(rawDesc)) continue;

      let signed: number;
      try {
        signed = Number(parseBrazilianMoney(rawAmount));
      } catch {
        continue;
      }
      if (!Number.isFinite(signed) || signed === 0) continue;

      const direction: "CREDIT" | "DEBIT" = signed < 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signed).toFixed(2);
      const transactionDate = `${yearFor(month)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Parcelas: "PARC 03/12" ou "3/12"
      let installmentCurrent: number | undefined;
      let installmentTotal: number | undefined;
      const parcMatch = rawDesc.match(/(?:PARC\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
      if (parcMatch) {
        installmentCurrent = Number(parcMatch[1]);
        installmentTotal = Number(parcMatch[2]);
        rawDesc = rawDesc.replace(parcMatch[0], "").replace(/\s{2,}/g, " ").trim();
      }
      const { normalizedDescription } = detectInstallment(rawDesc);

      const descriptionNormalized = normalizedDescription.trim();
      const merchantName = normalizeMerchantName(descriptionNormalized);
      const categorySuggestion = suggestCategoryName(descriptionNormalized, direction);
      const fingerprint = await getTransactionFingerprint({
        institution: "NUBANK",
        accountHint: currentCardEnd,
        transactionDate,
        amount,
        descriptionNormalized,
        direction,
        installmentCurrent,
        installmentTotal,
      });

      transactions.push({
        institution: "NUBANK",
        sourceType: "CREDIT_CARD",
        sourceAccountId: currentCardEnd,
        transactionDate,
        descriptionOriginal: rawDesc.trim(),
        descriptionNormalized,
        merchantName,
        amount,
        direction,
        installmentCurrent,
        installmentTotal,
        currency: "BRL",
        confidence: 0.85,
        categorySuggestion,
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(descriptionNormalized),
        metadata: { cardEnd: currentCardEnd || null, source: "nubank-pdf" },
      });
    }

    if (transactions.length === 0) {
      warnings.push("Nenhuma linha de lançamento encontrada no PDF. Verifique se o texto está selecionável.");
    }

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      metadata: {
        totalLines: lines.length,
        cardsSeen: currentCardEnd ? [currentCardEnd] : [],
      },
    };
  },
};
