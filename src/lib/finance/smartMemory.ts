/**
 * Memória de lançamentos repetidos: reaproveita o último lançamento parecido
 * (valor, categoria, conta, dia do vencimento) e atualiza a data para o mês atual.
 */
import { normalizeText } from "@/lib/finance/smartInputParser";

export interface MemoryTransaction {
  source: string | null;
  type: string;
  amount?: number | null;
  category_id: string | null;
  account_id: string;
  payment_method?: string | null;
  transaction_date?: string | null;
}

export interface MemoryMatch {
  source: string;
  type: "income" | "expense" | "transfer";
  amount: number | null;
  category_id: string | null;
  account_id: string | null;
  payment_method: string | null;
  /** Dia do mês usado da última vez (1..31). */
  day: number | null;
  /** Quantas vezes o lançamento apareceu no histórico. */
  occurrences: number;
  score: number;
}

const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "em", "no", "na", "para", "pra", "com",
  "conta", "pagamento", "pago", "paguei", "recebi", "recebido", "valor", "reais", "mes", "mês",
  "lancar", "lancamento", "puxe", "puxa", "ultimo", "ultima", "ultimos", "ultimas", "meu", "minha",
]);

const tokenize = (value: string) =>
  normalizeText(value || "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));

const toDay = (date?: string | null) => {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(String(date || ""));
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
};

/**
 * Procura no histórico o lançamento mais parecido com o texto informado.
 * Retorna null quando nenhuma palavra relevante coincide.
 */
export const findMemoryMatch = (
  history: MemoryTransaction[],
  text: string,
  type?: "income" | "expense" | "transfer",
): MemoryMatch | null => {
  const queryTokens = tokenize(text);
  if (!queryTokens.length) return null;

  let best: MemoryMatch | null = null;
  const counts = new Map<string, number>();

  history.forEach((item) => {
    const source = String(item.source || "").trim();
    if (!source) return;
    if (type && item.type !== type) return;
    const key = `${item.type}:${normalizeText(source)}`;
    counts.set(key, (counts.get(key) || 0) + 1);

    const sourceTokens = tokenize(source);
    if (!sourceTokens.length) return;
    const hits = sourceTokens.filter((token) => queryTokens.includes(token)).length;
    if (!hits) return;
    const score = hits / sourceTokens.length + hits * 0.1;
    if (best && score <= best.score) return;

    best = {
      source,
      type: (item.type as MemoryMatch["type"]) || "expense",
      amount: typeof item.amount === "number" && item.amount > 0 ? item.amount : null,
      category_id: item.category_id || null,
      account_id: item.account_id || null,
      payment_method: item.payment_method || null,
      day: toDay(item.transaction_date),
      occurrences: 0,
      score,
    };
  });

  if (!best) return null;
  const match = best as MemoryMatch;
  match.occurrences = counts.get(`${match.type}:${normalizeText(match.source)}`) || 1;
  return match;
};

/**
 * Devolve a mesma data mas no mês de referência (mantendo o dia).
 * Ex.: 2026-08-10 com referência 2026-09 => 2026-09-10.
 */
export const shiftDateToMonth = (day: number, reference: Date) => {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
};
