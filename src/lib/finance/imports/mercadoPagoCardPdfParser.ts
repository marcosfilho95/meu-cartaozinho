import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  normalizeText,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

// Ex.: "06/06     MERCADOLIVRE*GAZIN                               R$ 160,64"
// Ex.: "09/07     MERCADOPAGO*PICHAUINFORMA        Parcela 12 de 15      R$ 46,29"
const LINE_PATTERN = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?\s*R\$\s*-?\s*[\d.]*\d,\d{2})\s*$/;
const INSTALLMENT_PATTERN = /Parcela\s+(\d{1,2})\s+de\s+(\d{1,2})/i;
const CARD_HEADER_PATTERN = /Cart[aã]o\s+([A-Za-z]+)\s*\[\*+(\d{3,4})\]/i;
const MOVEMENTS_SECTION_PATTERN = /Movimenta[cç][õo]es\s+na\s+fatura/i;
const CLOSING_PATTERN = /Fechamento\s+da\s+fatura\s+(\d{2})\/(\d{2})\/(\d{4})/i;
const DUE_PATTERN = /Vence(?:r|\s+em|mento)?[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i;
const EMITTED_PATTERN = /Emitida\s+em[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i;

const NOISE_KEYWORDS = [
  "TOTAL",
  "SUBTOTAL",
  "SALDO",
  "LIMITE",
  "VENCIMENTO",
  "FECHAMENTO",
  "MELHOR DIA",
  "PROXIMO FECHAMENTO",
  "COMPRAS PARCELADAS",
  "FATURA PARCELADA",
];

const isNoise = (description: string) => {
  const upper = normalizeText(description);
  if (!upper) return true;
  return NOISE_KEYWORDS.some((keyword) => upper === keyword || upper.startsWith(`${keyword} `));
};

// No cabeçalho "Movimentações na fatura" aparecem créditos (pagamento
// da fatura, crédito concedido, estornos). Fora dela: gastos do cartão.
const CREDIT_SECTION_KEYWORDS = [
  "PAGAMENTO DA FATURA",
  "PAGAMENTO RECEBIDO",
  "CREDITO CONCEDIDO",
  "CREDITO DEVOLVIDO",
  "ESTORNO",
];

const looksLikeCredit = (description: string) => {
  const upper = normalizeText(description);
  return CREDIT_SECTION_KEYWORDS.some((keyword) => upper.includes(keyword));
};

export const mercadoPagoCardPdfParser: FinancialFileParser = {
  name: "mercado-pago-card-pdf",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const normalized = normalizeText(`${context.fileName}\n${context.fileText.slice(0, 15000)}`);
    const hasBrand = normalized.includes("MERCADO PAGO") || normalized.includes("MERCADOPAGO");
    const hasCardSignals =
      normalized.includes("CARTAO DE CREDITO MERCADO PAGO") ||
      normalized.includes("FECHAMENTO DA FATURA") ||
      normalized.includes("MOVIMENTACOES NA FATURA") ||
      /CARTAO\s+VISA\s*\[\*+\d{3,4}\]/.test(normalized) ||
      /CARTAO\s+MASTERCARD\s*\[\*+\d{3,4}\]/.test(normalized);
    const isPdf = /\.pdf$/i.test(context.fileName) || context.mimeType?.includes("pdf");
    const manualHit = context.manualInstitution === "MERCADO_PAGO" && context.manualDocumentType === "CREDIT_CARD_STATEMENT";

    const confidence = manualHit
      ? 0.95
      : hasBrand && hasCardSignals
        ? isPdf
          ? 0.94
          : 0.86
        : hasBrand && normalized.includes("PARCELA")
          ? 0.55
          : 0;

    return {
      confidence,
      institution: confidence > 0 ? "MERCADO_PAGO" : "UNKNOWN",
      documentType: "CREDIT_CARD_STATEMENT",
      format: "PDF_TEXT",
      reason: confidence > 0 ? "Fatura de cartão Mercado Pago detectada." : "Sem sinais de fatura de cartão Mercado Pago.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    if (detection.confidence <= 0) throw new Error("Arquivo não parece ser fatura de cartão do Mercado Pago.");

    const text = context.fileText;
    const closing = text.match(CLOSING_PATTERN) || text.match(DUE_PATTERN) || text.match(EMITTED_PATTERN);
    const closingMonth = closing ? Number(closing[2]) : new Date().getMonth() + 1;
    const closingYear = closing ? Number(closing[3]) : new Date().getFullYear();

    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];
    let currentCardEnd: string | undefined;
    let inMovementsSection = false;

    const lines = text.split(/\r?\n/).map((line) => line.trim());

    for (const line of lines) {
      if (!line) continue;

      if (MOVEMENTS_SECTION_PATTERN.test(line)) {
        inMovementsSection = true;
        currentCardEnd = undefined;
        continue;
      }

      const cardMatch = line.match(CARD_HEADER_PATTERN);
      if (cardMatch) {
        currentCardEnd = cardMatch[2];
        inMovementsSection = false;
        continue;
      }

      const match = line.match(LINE_PATTERN);
      if (!match) continue;

      const day = Number(match[1]);
      const month = Number(match[2]);
      const rawDesc = match[3].trim();
      if (isNoise(rawDesc)) continue;

      let signed: number;
      try {
        signed = Number(parseBrazilianMoney(match[4]));
      } catch {
        continue;
      }
      if (!Number.isFinite(signed) || signed === 0) continue;

      // Regra de ano: meses posteriores ao mês de fechamento pertencem ao ano anterior.
      const year = month > closingMonth ? closingYear - 1 : closingYear;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      let installmentCurrent: number | undefined;
      let installmentTotal: number | undefined;
      let cleanedDesc = rawDesc;
      const installmentMatch = rawDesc.match(INSTALLMENT_PATTERN);
      if (installmentMatch) {
        installmentCurrent = Number(installmentMatch[1]);
        installmentTotal = Number(installmentMatch[2]);
        cleanedDesc = rawDesc.replace(installmentMatch[0], "").replace(/\s+/g, " ").trim();
      }

      // A fatura sempre apresenta valores positivos: usamos o contexto (seção
      // "Movimentações na fatura" ou palavras-chave) para inferir crédito.
      const isCredit = signed < 0 || inMovementsSection || looksLikeCredit(cleanedDesc);
      const direction: "CREDIT" | "DEBIT" = isCredit ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signed).toFixed(2);

      const normalized = normalizeMerchantName(cleanedDesc);
      const fingerprint = await getTransactionFingerprint({
        institution: "MERCADO_PAGO",
        accountHint: currentCardEnd || "mercado-pago-card",
        transactionDate: date,
        amount,
        descriptionNormalized: normalized,
        direction,
        installmentCurrent,
        installmentTotal,
      });

      transactions.push({
        institution: "MERCADO_PAGO",
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
        confidence: 0.88,
        categorySuggestion: suggestCategoryName(cleanedDesc, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(cleanedDesc),
        metadata: {
          parser: "mercado-pago-card-pdf",
          cardEnd: currentCardEnd,
          section: inMovementsSection ? "movements" : "card",
        },
      });
    }

    if (transactions.length === 0) {
      warnings.push("Nenhuma transação reconhecida na fatura Mercado Pago. Confira se o PDF tem texto selecionável.");
    }

    return {
      parserName: this.name,
      detection,
      period: closing ? { end: `${closing[3]}-${closing[2]}-${closing[1]}` } : undefined,
      transactions,
      warnings,
      metadata: {
        fileName: context.fileName,
        fileHash: context.fileHash,
        closingDate: closing?.[0],
      },
    };
  },
};
