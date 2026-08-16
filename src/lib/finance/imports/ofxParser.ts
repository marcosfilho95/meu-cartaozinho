import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  suggestCategoryName,
} from "./utils";

/**
 * Parser OFX/OFC real (SGML e XML). Lê os blocos <STMTTRN> e monta as
 * movimentações normalizadas, independente do banco emissor.
 */

const tag = (block: string, name: string): string | null => {
  const xml = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  if (xml) return xml[1].trim();
  const sgml = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return sgml ? sgml[1].trim() : null;
};

const parseOfxDate = (raw: string | null): string | null => {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
};

export const isOfxText = (text: string) => /<OFX[\s>]/i.test(text) || /OFXHEADER\s*:/i.test(text);

const detectInstitution = (text: string) => {
  const upper = text.toUpperCase();
  if (upper.includes("NUBANK") || upper.includes("NU PAGAMENTOS")) return "NUBANK" as const;
  if (upper.includes("MERCADO PAGO") || upper.includes("MERCADOPAGO")) return "MERCADO_PAGO" as const;
  if (upper.includes("PICPAY")) return "PICPAY" as const;
  if (upper.includes("C6 BANK") || upper.includes("BANCO C6")) return "C6" as const;
  if (upper.includes("BRADESCARD") || upper.includes("AMAZON PRIME")) return "BRADESCARD" as const;
  if (upper.includes("BRADESCO")) return "BRADESCO" as const;
  return "UNKNOWN" as const;
};

export const ofxParser: FinancialFileParser = {
  name: "ofx",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const text = context.fileText;
    const institution = detectInstitution(text);
    if (!isOfxText(text)) {
      return { confidence: 0, institution, documentType: "UNKNOWN", format: "UNKNOWN", reason: "Não é OFX." };
    }
    const count = (text.match(/<STMTTRN>/gi) || []).length;
    const isCard = /CREDITCARDMSGSRS|CCSTMTRS|<CCACCTFROM>/i.test(text);
    return {
      confidence: count > 0 ? 0.97 : 0.4,
      institution,
      documentType: isCard ? "CREDIT_CARD_STATEMENT" : "BANK_STATEMENT",
      format: "OFX",
      reason: `OFX com ${count} transações.`,
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const text = context.fileText;
    // OFX XML fecha STMTTRN; OFX SGML antigo normalmente não fecha.
    const blocks = text
      .split(/<STMTTRN>/i)
      .slice(1)
      .map((part) => part.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>/i)[0])
      .filter(Boolean);
    const warnings: string[] = [];
    const transactions: NormalizedTransaction[] = [];
    const isCard = detection.documentType === "CREDIT_CARD_STATEMENT";

    const accountId = [tag(text, "BANKID"), tag(text, "ACCTID") || tag(text, "ACCTKEY")]
      .filter(Boolean)
      .join(":") || undefined;

    for (const block of blocks) {
      const date = parseOfxDate(tag(block, "DTPOSTED"));
      const rawAmount = tag(block, "TRNAMT");
      if (!date || !rawAmount) continue;
      const signed = Number(String(rawAmount).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(signed) || signed === 0) continue;
      const description = (tag(block, "MEMO") || tag(block, "NAME") || "Movimentação").replace(/\s+/g, " ").trim();
      const direction: "CREDIT" | "DEBIT" = signed > 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signed).toFixed(2);
      const normalized = normalizeMerchantName(description);
      const rawFitId = tag(block, "FITID") || undefined;
      const externalId = rawFitId ? `${detection.institution}:${accountId || "default"}:${rawFitId}` : undefined;
      const fingerprint = await getTransactionFingerprint({
        institution: detection.institution,
        accountHint: accountId,
        transactionDate: date,
        amount,
        descriptionNormalized: normalized,
        direction,
      });

      transactions.push({
        externalId,
        institution: detection.institution,
        sourceType: isCard ? "CREDIT_CARD" : "BANK_ACCOUNT",
        sourceAccountId: accountId,
        transactionDate: date,
        postingDate: parseOfxDate(tag(block, "DTAVAIL")) || undefined,
        descriptionOriginal: description,
        descriptionNormalized: normalized,
        merchantName: normalized,
        amount,
        direction,
        transactionType: tag(block, "TRNTYPE") || undefined,
        currency: "BRL",
        confidence: 0.95,
        categorySuggestion: suggestCategoryName(description, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(description),
        metadata: { parser: "ofx", fitId: rawFitId, accountId },
      });
    }

    if (transactions.length === 0) warnings.push("Arquivo OFX lido, mas nenhum bloco <STMTTRN> válido foi encontrado.");

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      period: {
        start: parseOfxDate(tag(text, "DTSTART")) || undefined,
        end: parseOfxDate(tag(text, "DTEND")) || undefined,
      },
      totals: {
        finalBalance: tag(text, "BALAMT") || undefined,
      },
      metadata: { fileName: context.fileName, fileHash: context.fileHash, accountId },
    };
  },
};
