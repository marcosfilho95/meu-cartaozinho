import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  formatDecimal,
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  normalizeText,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

const parseBrazilianDate = (value: string) => {
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const moneyPattern = /-?\s*R\$\s*-?\s*[\d.]+,\d{2}/g;
const dateAtStartPattern = /^(\d{2}[/-]\d{2}[/-]\d{4})(?:\s+(.+))?$/;
const operationPrefixPattern = /^(pix recebido|pix enviado|pagamento(?:\s|$)|dinheiro|rendimentos)/i;

const extractOperationId = (line: string) => {
  const explicit = line.match(/\b(?:ID|Operacao|Opera[cç][aã]o)\s*:?\s*([A-Za-z0-9._-]+)/i);
  if (explicit) return explicit[1];

  const numeric = line.match(/\b(\d{9,})\b/);
  return numeric?.[1] || "";
};

const stripParsedTokens = (line: string) =>
  line
    .replace(moneyPattern, " ")
    .replace(/\b(?:ID|Operacao|Opera[cç][aã]o)\s*:?\s*[A-Za-z0-9._-]+/gi, " ")
    .replace(/\b\d{9,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isIgnoredLine = (line: string) =>
  /^pagina\s+\d+/i.test(normalizeText(line).toLowerCase()) ||
  /^\d+\s*\/\s*\d+$/.test(line) ||
  /^mercado\s+pago$/i.test(line) ||
  /saldo inicial|saldo final|entradas|saidas|saídas|periodo|período|cpf|agencia|agência|conta|detalhe dos movimentos|data descrição|data descricao|data de geracao|data de geração|portal de ajuda|ouvidoria|cnpj|mercado pago institu/i.test(
    line,
  );

const appendToTransactionDescription = async (transaction: NormalizedTransaction, line: string) => {
  const nextOriginal = `${transaction.descriptionOriginal} ${line}`.replace(/\s+/g, " ").trim();
  const normalized = normalizeMerchantName(nextOriginal);

  transaction.descriptionOriginal = nextOriginal;
  transaction.descriptionNormalized = normalized;
  transaction.merchantName = normalized;
  transaction.categorySuggestion = suggestCategoryName(nextOriginal, transaction.direction);
  transaction.possibleInternalTransfer = isLikelyInternalTransfer(nextOriginal);
  transaction.fingerprint = await getTransactionFingerprint({
    institution: "MERCADO_PAGO",
    accountHint: "mercado-pago",
    transactionDate: transaction.transactionDate,
    amount: transaction.amount,
    descriptionNormalized: normalized,
    direction: transaction.direction,
  });
};

export const parseMercadoPagoTextRows = async (text: string) => {
  const cleanLines = text
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isIgnoredLine(line));

  const transactions: NormalizedTransaction[] = [];
  const warnings: string[] = [];
  let currentDate = "";
  let descriptionBuffer: string[] = [];
  let currentExternalId = "";
  let prefixBuffer: string[] = [];
  let lastTransactionIndex = -1;

  const flush = async (amountText?: string, balanceText?: string) => {
    if (!currentDate || !amountText || descriptionBuffer.length === 0) return;

    const signedAmount = Number(parseBrazilianMoney(amountText));
    const direction = signedAmount >= 0 ? "CREDIT" : "DEBIT";
    const amount = formatDecimal(Math.abs(signedAmount));
    const descriptionOriginal = descriptionBuffer.join(" ").replace(/\s+/g, " ").trim();
    const normalized = normalizeMerchantName(descriptionOriginal);
    const fingerprint = await getTransactionFingerprint({
      institution: "MERCADO_PAGO",
      accountHint: "mercado-pago",
      transactionDate: currentDate,
      amount,
      descriptionNormalized: normalized,
      direction,
    });

    transactions.push({
      externalId: currentExternalId || undefined,
      institution: "MERCADO_PAGO",
      sourceType: "BANK_ACCOUNT",
      transactionDate: currentDate,
      descriptionOriginal,
      descriptionNormalized: normalized,
      merchantName: normalized,
      amount,
      direction,
      transactionType: descriptionOriginal.split(" ").slice(0, 4).join(" "),
      currency: "BRL",
      confidence: currentExternalId ? 0.91 : 0.76,
      categorySuggestion: suggestCategoryName(descriptionOriginal, direction),
      fingerprint,
      possibleInternalTransfer: isLikelyInternalTransfer(descriptionOriginal),
      metadata: {
        operationId: currentExternalId || null,
        balanceAfter: balanceText ? parseBrazilianMoney(balanceText) : null,
        parser: "mercado-pago-text",
      },
    });

    lastTransactionIndex = transactions.length - 1;
    descriptionBuffer = [];
    currentExternalId = "";
    currentDate = "";
  };

  for (const line of cleanLines) {
    const dateMatch = line.match(dateAtStartPattern);
    const moneyMatches = line.match(moneyPattern) || [];

    if (dateMatch) {
      await flush();
      currentDate = parseBrazilianDate(dateMatch[1]) || "";
      descriptionBuffer = [...prefixBuffer];
      prefixBuffer = [];
      currentExternalId = extractOperationId(line);

      if (dateMatch[2]) {
        const descriptionPart = stripParsedTokens(dateMatch[2]);
        if (descriptionPart) descriptionBuffer.push(descriptionPart);
      }

      if (moneyMatches.length > 0) {
        const amountText = moneyMatches[0];
        const balanceText = moneyMatches.length > 1 ? moneyMatches[moneyMatches.length - 1] : undefined;
        await flush(amountText, balanceText);
      }

      continue;
    }

    const idMatch = line.match(/\b(?:ID|Operacao|Opera[cç][aã]o)\s*:?\s*([A-Za-z0-9._-]+)/i);
    if (idMatch) {
      currentExternalId = idMatch[1];
      const withoutId = line.replace(idMatch[0], "").trim();
      if (withoutId && currentDate) descriptionBuffer.push(withoutId);
      continue;
    }

    if (moneyMatches.length > 0 && currentDate) {
      const amountText = moneyMatches[0];
      const balanceText = moneyMatches.length > 1 ? moneyMatches[moneyMatches.length - 1] : undefined;
      const descriptionPart = stripParsedTokens(line);
      if (descriptionPart) descriptionBuffer.push(descriptionPart);
      if (!currentExternalId) currentExternalId = extractOperationId(line);
      await flush(amountText, balanceText);
      continue;
    }

    if (currentDate) {
      descriptionBuffer.push(line);
      continue;
    }

    if (operationPrefixPattern.test(line)) {
      prefixBuffer = [line];
      continue;
    }

    if (lastTransactionIndex >= 0) {
      await appendToTransactionDescription(transactions[lastTransactionIndex], line);
      continue;
    }

    prefixBuffer.push(line);
  }

  await flush();

  if (transactions.length === 0) {
    warnings.push("Nenhuma movimentacao Mercado Pago foi identificada. Verifique se o PDF tem texto selecionavel.");
  }

  return { transactions, warnings };
};

export const mercadoPagoTextParser: FinancialFileParser = {
  name: "mercado-pago-text",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const normalized = normalizeText(`${context.fileName}\n${context.fileText.slice(0, 1600)}`);
    const hasBrand = normalized.includes("MERCADO PAGO") || normalized.includes("MERCADOPAGO") || context.manualInstitution === "MERCADO_PAGO";
    const hasStatementSignals =
      normalized.includes("SALDO INICIAL") ||
      normalized.includes("SALDO FINAL") ||
      normalized.includes("DETALHE DOS MOVIMENTOS") ||
      normalized.includes("PIX RECEBIDO") ||
      normalized.includes("PIX ENVIADO") ||
      normalized.includes("RENDIMENTOS");

    return {
      confidence: hasBrand && hasStatementSignals ? 0.9 : hasBrand ? 0.5 : 0,
      institution: hasBrand ? "MERCADO_PAGO" : "UNKNOWN",
      documentType: "BANK_STATEMENT",
      format: context.manualFormat === "PDF_TEXT" || context.mimeType === "application/pdf" ? "PDF_TEXT" : "TXT",
      reason: hasBrand ? "Texto contem sinais de extrato Mercado Pago." : "Marca Mercado Pago nao encontrada.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    if (detection.confidence <= 0) throw new Error("Arquivo nao parece ser extrato textual do Mercado Pago.");
    const { transactions, warnings } = await parseMercadoPagoTextRows(context.fileText);

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      metadata: {
        fileName: context.fileName,
        fileHash: context.fileHash,
      },
    };
  },
};
