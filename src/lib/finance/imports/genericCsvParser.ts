import { FinancialFileParser, NormalizedTransaction, ParserContext, ParserDetectionResult } from "./types";
import {
  getTransactionFingerprint,
  isLikelyInternalTransfer,
  normalizeMerchantName,
  normalizeText,
  parseBrazilianMoney,
  suggestCategoryName,
} from "./utils";

const splitCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
};

const detectDelimiter = (headerLine: string) => {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs > semis && tabs > commas) return "\t";
  if (semis > commas) return ";";
  return ",";
};

const DATE_KEYS = ["data", "date", "dt", "data lançamento", "data lancamento", "data movim", "data movimento"];
const DESC_KEYS = ["descricao", "descrição", "description", "historico", "histórico", "detalhe", "detalhes", "title", "titulo", "título", "estabelecimento", "lançamento", "lancamento", "movimento"];
const AMOUNT_KEYS = [
  "valor (em r$)",
  "valor em r$",
  "valor r$",
  "valor (r$)",
  "valor brl",
  "valor",
  "amount",
  "value",
  "montante",
];
const AMOUNT_BLOCK = ["us$", "usd", "u$s", "dolar", "dólar", "cotacao", "cotação", "quantidade", "qtd"];
const CREDIT_KEYS = ["credito", "crédito", "credit", "entrada", "entradas"];
const DEBIT_KEYS = ["debito", "débito", "debit", "saida", "saída", "saidas", "saídas"];
const CATEGORY_KEYS = ["categoria", "category"];
const INSTALLMENT_KEYS = ["parcela", "parcelas", "installment", "installments"];
const CARD_FINAL_KEYS = ["final do cartão", "final do cartao", "final cartão", "final cartao"];

const findColumn = (header: string[], candidates: string[], blocklist: string[] = []) => {
  const normalized = header.map((h) => normalizeText(h).toLowerCase());
  const isBlocked = (col: string) => blocklist.some((b) => col.includes(b));
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx >= 0 && !isBlocked(normalized[idx])) return idx;
  }
  for (const candidate of candidates) {
    for (let i = 0; i < normalized.length; i += 1) {
      if (normalized[i].includes(candidate) && !isBlocked(normalized[i])) return i;
    }
  }
  return -1;
};

type CsvHeaderInfo = {
  index: number;
  delimiter: string;
  header: string[];
  dateIdx: number;
  descIdx: number;
  amountIdx: number;
  creditIdx: number;
  debitIdx: number;
};

const getNonEmptyLines = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const findCsvHeader = (lines: string[]): CsvHeaderInfo | null => {
  for (let index = 0; index < Math.min(lines.length, 100); index += 1) {
    const line = lines[index];
    if (!/[,;\t]/.test(line)) continue;
    const delimiter = detectDelimiter(line);
    const header = splitCsvLine(line, delimiter);
    const dateIdx = findColumn(header, DATE_KEYS);
    const descIdx = findColumn(header, DESC_KEYS);
    const amountIdx = findColumn(header, AMOUNT_KEYS, AMOUNT_BLOCK);
    const creditIdx = findColumn(header, CREDIT_KEYS);
    const debitIdx = findColumn(header, DEBIT_KEYS);
    const hasAmount = amountIdx >= 0 || (creditIdx >= 0 && debitIdx >= 0);

    if (dateIdx >= 0 && descIdx >= 0 && hasAmount) {
      return { index, delimiter, header, dateIdx, descIdx, amountIdx, creditIdx, debitIdx };
    }
  }

  return null;
};

const detectDocument = (lines: string[], headerInfo: CsvHeaderInfo | null) => {
  const prefix = normalizeText(lines.slice(0, Math.min((headerInfo?.index || 0) + 1, 20)).join(" "));
  const header = normalizeText(headerInfo?.header.join(" ") || "");
  const isC6 = prefix.includes("FATURA C6")
    || (header.includes("NOME NO CARTAO") && header.includes("FINAL DO CARTAO"));
  const isCreditCard = isC6
    || header.includes("FINAL DO CARTAO")
    || (header.includes("PARCELA") && header.includes("NOME NO CARTAO"));

  return {
    institution: isC6 ? "C6" as const : "UNKNOWN" as const,
    documentType: isCreditCard ? "CREDIT_CARD_STATEMENT" as const : "BANK_STATEMENT" as const,
  };
};

const parseInstallment = (raw: string) => {
  const match = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return {};
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < current) return {};
  return { installmentCurrent: current, installmentTotal: total };
};

const suggestFromSourceCategory = (raw: string) => {
  const normalized = normalizeText(raw);
  if (!normalized || normalized === "-") return undefined;
  if (normalized.includes("EDUC")) return "Educacao";
  if (normalized.includes("ALIMENT")) return "Alimentacao";
  if (normalized.includes("RESTAUR")) return "Restaurante";
  if (normalized.includes("MERCADO")) return "Mercado";
  if (normalized.includes("SAUDE")) return "Saude";
  if (normalized.includes("FARMAC")) return "Farmacia";
  if (normalized.includes("GASOL") || normalized.includes("COMBUST")) return "Gasolina";
  if (normalized.includes("TRANSPORT")) return "Transporte";
  if (normalized.includes("VIAGEM")) return "Viagens";
  if (normalized.includes("LAZER") || normalized.includes("ENTRETEN")) return "Lazer";
  return undefined;
};

const parseFlexibleDate = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = value.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2]}-${br[1]}`;
  }
  return null;
};

export const genericCsvParser: FinancialFileParser = {
  name: "generic-csv",

  async canHandle(context: ParserContext): Promise<ParserDetectionResult> {
    const lines = getNonEmptyLines(context.fileText);
    if (!lines.length) return { confidence: 0, institution: "UNKNOWN", documentType: "UNKNOWN", format: "CSV", reason: "vazio" };
    const isCsvName = /\.csv$/i.test(context.fileName) || context.mimeType?.includes("csv");
    const headerInfo = findCsvHeader(lines);
    const document = detectDocument(lines, headerInfo);
    const score = headerInfo
      ? 0.7 + (isCsvName ? 0.05 : 0) + (document.institution === "C6" ? 0.1 : 0)
      : (isCsvName ? 0.1 : 0);

    return {
      confidence: Math.min(score, 0.85),
      institution: document.institution,
      documentType: headerInfo ? document.documentType : "UNKNOWN",
      format: "CSV",
      reason: headerInfo
        ? `${document.institution === "C6" ? "Fatura C6" : "CSV genérico"} com colunas reconhecíveis${headerInfo.index > 0 ? " após linhas introdutórias" : ""}.`
        : "CSV sem colunas padrão reconhecíveis.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const lines = getNonEmptyLines(context.fileText);
    if (lines.length < 2) throw new Error("CSV vazio ou sem cabeçalho.");
    const headerInfo = findCsvHeader(lines);
    if (!headerInfo) throw new Error("Não consegui identificar as colunas de data, descrição e valor.");
    const { delimiter, header, dateIdx, descIdx, amountIdx, creditIdx, debitIdx } = headerInfo;
    const categoryIdx = findColumn(header, CATEGORY_KEYS);
    const installmentIdx = findColumn(header, INSTALLMENT_KEYS);
    const cardFinalIdx = findColumn(header, CARD_FINAL_KEYS);
    const isCreditCard = detection.documentType === "CREDIT_CARD_STATEMENT";
    const invertC6CardSign = detection.institution === "C6" && isCreditCard;

    if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && creditIdx < 0 && debitIdx < 0)) {
      throw new Error("Não consegui identificar as colunas de data, descrição e valor.");
    }

    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];

    for (const line of lines.slice(headerInfo.index + 1)) {
      const cells = splitCsvLine(line, delimiter);
      const dateRaw = cells[dateIdx] || "";
      const date = parseFlexibleDate(dateRaw);
      if (!date) {
        warnings.push(`Linha ignorada (data inválida): ${dateRaw}`);
        continue;
      }
      const original = cells[descIdx] || "";
      let signedValue = 0;
      if (amountIdx >= 0) {
        try { signedValue = Number(parseBrazilianMoney(cells[amountIdx] || "0")); } catch { continue; }
      } else {
        const credit = creditIdx >= 0 ? Number(parseBrazilianMoney(cells[creditIdx] || "0")) : 0;
        const debit = debitIdx >= 0 ? Number(parseBrazilianMoney(cells[debitIdx] || "0")) : 0;
        signedValue = credit - Math.abs(debit);
      }
      if (!Number.isFinite(signedValue) || signedValue === 0) continue;
      const direction: "CREDIT" | "DEBIT" = invertC6CardSign
        ? (signedValue >= 0 ? "DEBIT" : "CREDIT")
        : (signedValue >= 0 ? "CREDIT" : "DEBIT");
      const amount = Math.abs(signedValue).toFixed(2);
      const normalized = normalizeMerchantName(original);
      const accountHint = cardFinalIdx >= 0 ? cells[cardFinalIdx] || undefined : undefined;
      const sourceCategory = categoryIdx >= 0 ? cells[categoryIdx] || "" : "";
      const installment = installmentIdx >= 0 ? parseInstallment(cells[installmentIdx] || "") : {};
      const fingerprint = await getTransactionFingerprint({
        institution: detection.institution,
        accountHint,
        transactionDate: date,
        amount,
        descriptionNormalized: normalized,
        direction,
      });

      transactions.push({
        institution: detection.institution,
        sourceType: isCreditCard ? "CREDIT_CARD" : "BANK_ACCOUNT",
        sourceAccountId: accountHint,
        transactionDate: date,
        descriptionOriginal: original,
        descriptionNormalized: normalized,
        merchantName: normalized,
        amount,
        direction,
        ...installment,
        currency: "BRL",
        confidence: detection.institution === "C6" ? 0.85 : 0.7,
        categorySuggestion: suggestFromSourceCategory(sourceCategory) || suggestCategoryName(original, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(original),
        metadata: { parser: "generic-csv", rawLine: line, sourceCategory, accountHint },
      });
    }

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      metadata: {
        fileName: context.fileName,
        fileHash: context.fileHash,
        delimiter,
        headerLine: headerInfo.index + 1,
      },
    };
  },
};
