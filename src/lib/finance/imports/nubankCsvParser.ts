import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  detectInstallment,
  getTransactionFingerprint,
  normalizeMerchantName,
  normalizeText,
  parseBrazilianMoney,
  parseIsoDate,
  suggestCategoryName,
} from "./utils";

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

export const parseNubankCsvRows = async (text: string) => {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((item) => item.toLowerCase());
  const dateIndex = header.indexOf("date");
  const titleIndex = header.indexOf("title");
  const amountIndex = header.indexOf("amount");

  if (dateIndex < 0 || titleIndex < 0 || amountIndex < 0) {
    throw new Error("CSV Nubank deve conter as colunas date,title,amount.");
  }

  const transactions: NormalizedTransaction[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = parseIsoDate(cells[dateIndex] || "");
    const original = cells[titleIndex] || "";
    const amount = parseBrazilianMoney(cells[amountIndex] || "");
    const installment = detectInstallment(original);
    const normalizedDescription = normalizeMerchantName(installment.normalizedDescription || original);
    const direction = Number(amount) >= 0 ? "DEBIT" : "CREDIT";
    const absoluteAmount = Math.abs(Number(amount)).toFixed(2);
    const fingerprint = await getTransactionFingerprint({
      institution: "NUBANK",
      transactionDate: date,
      amount: absoluteAmount,
      descriptionNormalized: normalizedDescription,
      direction,
      installmentCurrent: installment.installmentCurrent,
      installmentTotal: installment.installmentTotal,
    });

    transactions.push({
      institution: "NUBANK",
      sourceType: "CREDIT_CARD",
      transactionDate: date,
      descriptionOriginal: original,
      descriptionNormalized: normalizedDescription,
      merchantName: normalizedDescription,
      amount: absoluteAmount,
      direction,
      installmentCurrent: installment.installmentCurrent,
      installmentTotal: installment.installmentTotal,
      currency: "BRL",
      confidence: 0.96,
      categorySuggestion: suggestCategoryName(original, direction),
      fingerprint,
      metadata: {
        rawLine: line,
        parser: "nubank-csv",
      },
    });
  }

  return transactions;
};

export const nubankCsvParser: FinancialFileParser = {
  name: "nubank-csv",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const fileName = normalizeText(context.fileName);
    const firstLine = context.fileText.split(/\r?\n/)[0] || "";
    const hasExpectedHeader = normalizeText(firstLine) === "DATE,TITLE,AMOUNT";
    const looksNubank = fileName.includes("NUBANK") || context.manualInstitution === "NUBANK";

    return {
      confidence: hasExpectedHeader ? (looksNubank ? 0.98 : 0.82) : 0,
      institution: hasExpectedHeader ? "NUBANK" : "UNKNOWN",
      documentType: "CREDIT_CARD_STATEMENT",
      format: "CSV",
      reason: hasExpectedHeader ? "CSV com cabeçalho date,title,amount." : "Cabeçalho Nubank não encontrado.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    if (detection.confidence <= 0) throw new Error("Arquivo não parece ser CSV Nubank.");
    const transactions = await parseNubankCsvRows(context.fileText);

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings: [],
      metadata: {
        fileName: context.fileName,
        fileHash: context.fileHash,
      },
    };
  },
};

