import { TransactionDirection } from "./types";
import { normalizeText } from "./utils";

/**
 * Regras financeiras determinísticas usadas TANTO no fallback local quanto como
 * contrato da IA. Nunca inventam valores/datas — só interpretam a descrição,
 * a direção (crédito/débito) e a origem (conta x cartão).
 */

export type FinancialRole =
  | "income"
  | "expense"
  | "transfer"
  | "card_purchase"
  | "refund"
  | "bill_payment"
  | "investment_in"
  | "investment_out"
  | "yield"
  | "fee";

export type FinancialClassification = {
  role: FinancialRole;
  /** Como a movimentação entra no fluxo de caixa. */
  type: "income" | "expense" | "transfer";
  /** Estornos entram como despesa negativa (reduzem a categoria original). */
  negativeAmount: boolean;
  needsReview: boolean;
  reason: string;
  categoryHint?: string;
};

export type ClassifiableRow = {
  descriptionOriginal?: string;
  descriptionNormalized?: string;
  merchantName?: string | null;
  direction: TransactionDirection;
  sourceType?: "BANK_ACCOUNT" | "CREDIT_CARD" | null;
  possibleInternalTransfer?: boolean;
};

const has = (haystack: string, terms: string[]) => terms.some((t) => haystack.includes(t));

export const BILL_PAYMENT_TERMS = [
  "PAGAMENTO RECEBIDO",
  "PAGAMENTO DE FATURA",
  "PAGAMENTO FATURA",
  "PAGAMENTO EFETUADO",
  "PGTO FATURA",
  "PGTO. FATURA",
  "PAGTO FATURA",
  "PAGAMENTO CARTAO",
  "PAGAMENTO DE CARTAO",
  "PAGAMENTO CARTAO DE CREDITO",
  "FATURA CARTAO",
];

export const YIELD_TERMS = [
  "RENDIMENTO",
  "RENDIMENTOS",
  "RENDIMENTO DA CONTA",
  "REMUNERACAO DO SALDO",
  "JUROS RECEBIDOS",
  "DIVIDENDO",
  "DIVIDENDOS",
  "JCP",
  "JUROS SOBRE CAPITAL",
];

export const INVESTMENT_TERMS = [
  "APLICACAO",
  "APLICACOES",
  "APLIC AUTOM",
  "APLICACAO AUTOMATICA",
  "INVESTIMENTO",
  "CDB",
  "LCI",
  "LCA",
  "TESOURO DIRETO",
  "FUNDO DE INVESTIMENTO",
  "COFRINHO",
  "CAIXINHA",
  "RESERVA",
];

export const REDEEM_TERMS = ["RESGATE", "RESGATES", "RETIRADA DE INVESTIMENTO", "RETIRADA COFRINHO", "LIQUIDACAO CDB"];

export const FEE_TERMS = [
  "TARIFA",
  "ANUIDADE",
  "IOF",
  "MULTA",
  "JUROS DE MORA",
  "JUROS ROTATIVO",
  "ENCARGOS",
  "JUROS DE PARCELAMENTO",
];

export const REFUND_TERMS = ["ESTORNO", "REEMBOLSO", "DEVOLUCAO", "CANCELAMENTO DE COMPRA", "CHARGEBACK", "AJUSTE A CREDITO"];

export const TRANSFER_TERMS = ["PIX ENVIADO", "PIX RECEBIDO", "TRANSFERENCIA", "TED", "DOC ", "TRANSF ENTRE CONTAS"];

const hay = (row: ClassifiableRow) =>
  normalizeText(`${row.descriptionOriginal || ""} ${row.descriptionNormalized || ""} ${row.merchantName || ""}`);

export const classifyFinancialRow = (row: ClassifiableRow): FinancialClassification => {
  const text = hay(row);
  const isCard = row.sourceType === "CREDIT_CARD";
  const isCredit = row.direction === "CREDIT";

  // 1. Pagamento de fatura — nunca receita, nunca despesa (é transferência).
  if (has(text, BILL_PAYMENT_TERMS)) {
    return {
      role: "bill_payment",
      type: "transfer",
      negativeAmount: false,
      needsReview: false,
      reason: "Pagamento de fatura do cartão: transferência entre contas.",
      categoryHint: "Entre Contas",
    };
  }

  // 2. Rendimentos / dividendos / juros recebidos são receita real.
  if (isCredit && has(text, YIELD_TERMS)) {
    const insideRedeem = has(text, REDEEM_TERMS);
    return {
      role: "yield",
      type: "income",
      negativeAmount: false,
      needsReview: insideRedeem,
      reason: insideRedeem
        ? "Resgate com rendimento embutido: confirme quanto é rendimento."
        : "Rendimento/juros recebidos: receita.",
      categoryHint: has(text, ["DIVIDENDO", "JCP", "JUROS SOBRE CAPITAL"]) ? "Dividendos" : "Rendimentos",
    };
  }

  // 3. Investimentos: aplicação e resgate do principal são movimentações, não resultado.
  if (has(text, REDEEM_TERMS) && isCredit) {
    return {
      role: "investment_out",
      type: "transfer",
      negativeAmount: false,
      needsReview: true,
      reason: "Resgate de investimento: principal volta como transferência (só o rendimento é receita).",
      categoryHint: "Investimentos",
    };
  }
  if (has(text, INVESTMENT_TERMS) && !isCredit) {
    return {
      role: "investment_in",
      type: "transfer",
      negativeAmount: false,
      needsReview: false,
      reason: "Aplicação em investimento: transferência, não despesa.",
      categoryHint: "Investimentos",
    };
  }

  // 4. Tarifas, juros e encargos são despesas bancárias.
  if (!isCredit && has(text, FEE_TERMS)) {
    return {
      role: "fee",
      type: "expense",
      negativeAmount: false,
      needsReview: false,
      reason: "Tarifa/juros/IOF: despesa bancária.",
      categoryHint: "Taxas Bancarias",
    };
  }

  // 5. Estornos reduzem a despesa original.
  if (isCredit && (has(text, REFUND_TERMS) || isCard)) {
    const explicit = has(text, REFUND_TERMS);
    return {
      role: "refund",
      type: "expense",
      negativeAmount: true,
      needsReview: !explicit,
      reason: explicit
        ? "Estorno: reduz a despesa da categoria original."
        : "Crédito na fatura sem descrição clara: confirme se é estorno.",
    };
  }

  // 6. Transferências internas (PIX/TED entre contas do próprio usuário).
  if (row.possibleInternalTransfer || has(text, TRANSFER_TERMS)) {
    const explicitInternal = Boolean(row.possibleInternalTransfer);
    return {
      role: "transfer",
      type: explicitInternal ? "transfer" : isCredit ? "income" : "expense",
      negativeAmount: false,
      needsReview: true,
      reason: "Possível transferência entre contas próprias: confirme antes de salvar.",
      categoryHint: explicitInternal ? "Entre Contas" : undefined,
    };
  }

  // 7. Compra no cartão.
  if (isCard && !isCredit) {
    return {
      role: "card_purchase",
      type: "expense",
      negativeAmount: false,
      needsReview: false,
      reason: "Compra no cartão: despesa.",
    };
  }

  return {
    role: isCredit ? "income" : "expense",
    type: isCredit ? "income" : "expense",
    negativeAmount: false,
    needsReview: false,
    reason: isCredit ? "Crédito na conta: receita." : "Débito na conta: despesa.",
  };
};

/** Rótulos curtos usados nos badges da revisão. */
export const ROLE_LABEL: Record<FinancialRole, string> = {
  income: "receita",
  expense: "despesa",
  transfer: "transferência",
  card_purchase: "compra no cartão",
  refund: "estorno",
  bill_payment: "pagamento de fatura",
  investment_in: "aplicação",
  investment_out: "resgate",
  yield: "rendimento",
  fee: "tarifa/juros",
};