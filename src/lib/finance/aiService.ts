import { supabase } from "@/integrations/supabase/client";
import type { VisionBatchResult } from "./imports/vision";
import type { SmartParsedTransaction } from "./smartInputParser";

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
  /** Tipo já determinado pelas regras; a IA escolhe somente a categoria. */
  financialType: "income" | "expense" | "transfer";
  explicitAccount: string | null;
  institution: string | null;
};

export type AiClassifyResult = {
  index: number;
  categoryName: string;
  categoryKind: "income" | "expense" | "transfer";
  createIfMissing: boolean;
  confidence: number;
  accountName?: string | null;
};

export type FinanceAiErrorCode = "rate_limit" | "credits" | "network" | "empty_response" | "service";

export class FinanceAiError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly code: FinanceAiErrorCode = "service",
  ) {
    super(message);
    this.name = "FinanceAiError";
  }
}

const normalizeInvokeError = async (error: unknown, data: unknown) => {
  let responseDetail = "";
  const context = typeof error === "object" && error && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      responseDetail = String(body?.error || "");
    } catch {
      try { responseDetail = await context.clone().text(); } catch { /* corpo indisponível */ }
    }
  }
  const raw = responseDetail ||
    (typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error ?? "") : "") ||
    (error instanceof Error ? error.message : "");
  if (/429|rate/i.test(raw)) return new FinanceAiError("Muitas requisições à IA. Tente novamente em instantes.", true, "rate_limit");
  if (/402|credit|saldo/i.test(raw)) return new FinanceAiError("Créditos de IA esgotados no workspace.", false, "credits");
  if (/fetch|network|rede|load failed/i.test(raw)) return new FinanceAiError("Não foi possível acessar o serviço de IA.", true, "network");
  return new FinanceAiError(raw || "Serviço de IA indisponível no momento.", true, "service");
};

export const classifyTransactionsWithAi = async (
  rows: AiClassifyRow[],
  categories: AiCategoryRef[],
  accounts: Array<{ name: string; institution?: string | null }> = [],
): Promise<AiClassifyResult[]> => {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.functions.invoke("smart-classify-imports", {
    body: {
      rows,
      categories: categories.map((c) => ({ name: c.name, kind: c.kind })),
      accounts: accounts.map((account) => ({ name: account.name, institution: account.institution || null })),
    },
  });
  if (error || (data as { error?: unknown } | null)?.error) throw await normalizeInvokeError(error, data);
  return ((data as { results?: AiClassifyResult[] } | null)?.results || []) as AiClassifyResult[];
};

export type SmartParsePayload = {
  text?: string;
  imageDataUrl?: string;
  categories?: AiCategoryRef[];
  [key: string]: unknown;
};

export const parseSmartInputWithAi = async (payload: SmartParsePayload): Promise<SmartParsedTransaction[]> => {
  const { data, error } = await supabase.functions.invoke("smart-parse", { body: payload });
  if (error || (data as { error?: unknown } | null)?.error) throw await normalizeInvokeError(error, data);
  return ((data as { transactions?: SmartParsedTransaction[] } | null)?.transactions || []);
};

export const extractFinancialDocumentWithVision = async (payload: {
  images: Array<{ dataUrl: string; pageNumber: number }>;
  fileName: string;
  pageOffset?: number;
}): Promise<VisionBatchResult> => {
  const { data, error } = await supabase.functions.invoke("financial-document-vision", { body: payload });
  if (error || (data as { error?: unknown } | null)?.error) throw await normalizeInvokeError(error, data);
  return (data || {}) as VisionBatchResult;
};
