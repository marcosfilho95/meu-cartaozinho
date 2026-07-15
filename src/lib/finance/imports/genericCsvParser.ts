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
const AMOUNT_KEYS = ["valor", "amount", "value", "montante", "valor (r$)", "valor r$"];
const CREDIT_KEYS = ["credito", "crédito", "credit", "entrada", "entradas"];
const DEBIT_KEYS = ["debito", "débito", "debit", "saida", "saída", "saidas", "saídas"];

const findColumn = (header: string[], candidates: string[]) => {
  const normalized = header.map((h) => normalizeText(h).toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalized.length; i += 1) {
    if (candidates.some((c) => normalized[i].includes(c))) return i;
  }
  return -1;
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
    const firstLine = (context.fileText.split(/\r?\n/)[0] || "").trim();
    if (!firstLine) return { confidence: 0, institution: "UNKNOWN", documentType: "UNKNOWN", format: "CSV", reason: "vazio" };
    const isCsvName = /\.csv$/i.test(context.fileName) || context.mimeType?.includes("csv");
    const hasDelimiter = /[,;\t]/.test(firstLine);
    const header = splitCsvLine(firstLine, detectDelimiter(firstLine));
    const hasDate = findColumn(header, DATE_KEYS) >= 0;
    const hasDesc = findColumn(header, DESC_KEYS) >= 0;
    const hasAmount = findColumn(header, AMOUNT_KEYS) >= 0 || (findColumn(header, CREDIT_KEYS) >= 0 && findColumn(header, DEBIT_KEYS) >= 0);
    const score = (isCsvName ? 0.2 : 0) + (hasDelimiter ? 0.15 : 0) + (hasDate ? 0.2 : 0) + (hasDesc ? 0.15 : 0) + (hasAmount ? 0.2 : 0);

    return {
      confidence: Math.min(score, 0.75),
      institution: "UNKNOWN",
      documentType: "BANK_STATEMENT",
      format: "CSV",
      reason: hasDate && hasDesc && hasAmount ? "CSV genérico com colunas reconhecíveis." : "CSV sem colunas padrão reconhecíveis.",
    };
  },

  async parse(context: ParserContext) {
    const detection = await this.canHandle(context);
    const lines = context.fileText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error("CSV vazio ou sem cabeçalho.");
    const delimiter = detectDelimiter(lines[0]);
    const header = splitCsvLine(lines[0], delimiter);
    const dateIdx = findColumn(header, DATE_KEYS);
    const descIdx = findColumn(header, DESC_KEYS);
    const amountIdx = findColumn(header, AMOUNT_KEYS);
    const creditIdx = findColumn(header, CREDIT_KEYS);
    const debitIdx = findColumn(header, DEBIT_KEYS);

    if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && creditIdx < 0 && debitIdx < 0)) {
      throw new Error("Não consegui identificar as colunas de data, descrição e valor.");
    }

    const transactions: NormalizedTransaction[] = [];
    const warnings: string[] = [];

    for (const line of lines.slice(1)) {
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
      const direction: "CREDIT" | "DEBIT" = signedValue >= 0 ? "CREDIT" : "DEBIT";
      const amount = Math.abs(signedValue).toFixed(2);
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
        confidence: 0.7,
        categorySuggestion: suggestCategoryName(original, direction),
        fingerprint,
        possibleInternalTransfer: isLikelyInternalTransfer(original),
        metadata: { parser: "generic-csv", rawLine: line },
      });
    }

    return {
      parserName: this.name,
      detection,
      transactions,
      warnings,
      metadata: { fileName: context.fileName, fileHash: context.fileHash, delimiter },
    };
  },
};