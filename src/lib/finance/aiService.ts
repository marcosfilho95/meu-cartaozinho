import { supabase } from "@/integrations/supabase/client";

/**
 * Camada única de acesso à IA financeira.
 * Todas as telas (importação, adicionar inteligente) passam por aqui,
 * para termos um só lugar com contrato, tratamento de erro e fallback.
 */

export type AiCategoryRef = { name: string; kind: string; parent?: string | null };

export type AiClassifyRow = {
  index: number;
  description: string;
  merchant: string | null;
  amount: number;
  direction: string;
  sourceType: string | null;
  isTransfer: boolean;
};

export type AiClassifyResult = {
  index: number;
  categoryName: string;
  categoryKind: "income" | "expense" | "transfer";
  createIfMissing: boolean;
  confidence: number;
};

export class FinanceAiError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = "FinanceAiError";
  }
}

const normalizeInvokeError = (error: unknown, data: unknown) => {
  const raw =
    (typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error ?? "") : "") ||
    (error instanceof Error ? error.message : "");
  if (/429|rate/i.test(raw)) return new FinanceAiError("Muitas requisições à IA. Tente novamente em instantes.");
  if (/402|credit|saldo/i.test(raw)) return new FinanceAiError("Créditos de IA esgotados no workspace.", false);
  return new FinanceAiError(raw || "Serviço de IA indisponível no momento.");
};

export const classifyTransactionsWithAi = async (
  rows: AiClassifyRow[],
  categories: AiCategoryRef[],
): Promise<AiClassifyResult[]> => {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.functions.invoke("smart-classify-imports", {
    body: { rows, categories: categories.map((c) => ({ name: c.name, kind: c.kind })) },
  });
  if (error || (data as { error?: unknown } | null)?.error) throw normalizeInvokeError(error, data);
  return ((data as { results?: AiClassifyResult[] } | null)?.results || []) as AiClassifyResult[];
};

export type SmartParsePayload = {
  text?: string;
  imageDataUrl?: string;
  categories?: AiCategoryRef[];
  [key: string]: unknown;
};

export const parseSmartInputWithAi = async (payload: SmartParsePayload) => {
  const { data, error } = await supabase.functions.invoke("smart-parse", { body: payload });
  if (error || (data as { error?: unknown } | null)?.error) throw normalizeInvokeError(error, data);
  return ((data as { transactions?: unknown[] } | null)?.transactions || []) as Array<Record<string, unknown>>;
};
