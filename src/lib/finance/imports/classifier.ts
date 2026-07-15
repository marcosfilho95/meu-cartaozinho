import { NormalizedTransaction, TransactionDirection } from "./types";
import { normalizeMerchantName, normalizeText, suggestCategoryName } from "./utils";

/**
 * Camadas de classificação, do mais preciso ao mais genérico:
 *   1. Regras explícitas do usuário (`categorization_rules`).
 *   2. Histórico: mesma descrição normalizada já categorizada antes.
 *   3. Palavras-chave locais (expansíveis).
 *   4. Fallback "Outros".
 *
 * A interface `CategoryClassifier` deixa gancho pronto para uma implementação IA
 * futura sem tocar em quem consome.
 */

export type CategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  parent_id?: string | null;
};

export type CategorizationRule = {
  id: string;
  category_id: string | null;
  match_type: "contains" | "starts_with" | "equals" | "regex";
  pattern: string;
  direction?: TransactionDirection | null;
  priority: number;
  is_active: boolean;
};

export type HistoricalTransaction = {
  description: string;
  merchantName?: string | null;
  category_id: string | null;
  direction?: TransactionDirection | null;
};

export type ClassificationLayer = "rule" | "history" | "keyword" | "fallback" | "none";

export type ClassificationResult = {
  categoryId: string;
  layer: ClassificationLayer;
  confidence: number;
  reason?: string;
};

export interface CategoryClassifier {
  classify(row: NormalizedTransaction): ClassificationResult;
}

const norm = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();

const rowKind = (row: NormalizedTransaction): "income" | "expense" | "transfer" => {
  if (row.possibleInternalTransfer) return "transfer";
  return row.direction === "CREDIT" ? "income" : "expense";
};

const ruleMatchesRow = (rule: CategorizationRule, row: NormalizedTransaction) => {
  if (rule.direction && rule.direction !== row.direction) return false;
  const haystack = norm(`${row.descriptionNormalized} ${row.descriptionOriginal} ${row.merchantName || ""}`);
  const pattern = norm(rule.pattern);
  if (!pattern) return false;
  if (rule.match_type === "equals") return haystack === pattern;
  if (rule.match_type === "starts_with") return haystack.startsWith(pattern);
  if (rule.match_type === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(`${row.descriptionNormalized} ${row.descriptionOriginal} ${row.merchantName || ""}`);
    } catch {
      return false;
    }
  }
  return haystack.includes(pattern);
};

/**
 * Classificador local em camadas. Não faz nenhuma chamada externa.
 * Uma implementação IA no futuro pode encaixar a mesma interface e ser plugada
 * onde a `LocalCategoryClassifier` é usada hoje.
 */
export class LocalCategoryClassifier implements CategoryClassifier {
  private history: Map<string, string>;

  constructor(
    private categories: CategoryOption[],
    private rules: CategorizationRule[],
    historicalTransactions: HistoricalTransaction[] = [],
  ) {
    this.history = new Map();
    for (const tx of historicalTransactions) {
      if (!tx.category_id) continue;
      const key = norm(tx.merchantName || tx.description || "");
      if (!key || key.length < 3) continue;
      // Primeiro a ver ganha: preserva a categoria mais frequente/recente.
      if (!this.history.has(key)) this.history.set(key, tx.category_id);
    }
  }

  classify(row: NormalizedTransaction): ClassificationResult {
    const kind = rowKind(row);
    const availableIds = new Set(this.categories.filter((c) => c.kind === kind).map((c) => c.id));

    // 1. Regras explícitas
    const matchedRule = [...this.rules]
      .filter((r) => r.is_active && r.category_id && availableIds.has(r.category_id))
      .sort((a, b) => a.priority - b.priority)
      .find((r) => ruleMatchesRow(r, row));
    if (matchedRule?.category_id) {
      return { categoryId: matchedRule.category_id, layer: "rule", confidence: 0.98, reason: `Regra: ${matchedRule.pattern}` };
    }

    // 2. Histórico
    const merchantKey = norm(row.merchantName || row.descriptionNormalized || row.descriptionOriginal);
    if (merchantKey) {
      const historical = this.history.get(merchantKey);
      if (historical && availableIds.has(historical)) {
        return { categoryId: historical, layer: "history", confidence: 0.9, reason: "Mesma descrição já categorizada antes." };
      }
    }

    // 3. Palavras-chave locais (via suggestCategoryName)
    const suggested = norm(row.categorySuggestion || suggestCategoryName(row.descriptionOriginal, row.direction));
    if (suggested) {
      const byExact = this.categories.find((c) => c.kind === kind && norm(c.name) === suggested);
      if (byExact) return { categoryId: byExact.id, layer: "keyword", confidence: 0.7, reason: `Palavra-chave: ${suggested}` };
      const byContains = this.categories.find((c) => {
        if (c.kind !== kind) return false;
        const n = norm(c.name);
        return n.includes(suggested) || suggested.includes(n);
      });
      if (byContains) return { categoryId: byContains.id, layer: "keyword", confidence: 0.55, reason: `Palavra-chave: ${suggested}` };
    }

    // 4. Fallback "Outros"
    const fallback = this.categories.find((c) => c.kind === kind && /^outros/i.test(c.name));
    if (fallback) return { categoryId: fallback.id, layer: "fallback", confidence: 0.2, reason: "Sem correspondência — Outros." };

    return { categoryId: "", layer: "none", confidence: 0 };
  }
}

export const buildRuleCandidate = (row: NormalizedTransaction, categoryId: string, userId: string) => {
  const merchant = norm(row.merchantName || row.descriptionNormalized || row.descriptionOriginal);
  const cleaned = normalizeMerchantName(merchant);
  if (!cleaned || cleaned.length < 4) return null;
  return {
    user_id: userId,
    name: `Auto: ${cleaned.slice(0, 48)}`,
    category_id: categoryId,
    match_type: "contains" as const,
    pattern: cleaned,
    merchant_name: cleaned,
    direction: row.direction,
    is_active: true,
    priority: 25,
  };
};