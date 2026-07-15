import { ExistingTransactionMatch, InstitutionCode, NormalizedTransaction, TransactionDirection } from "./types";

const encoder = new TextEncoder();

export const normalizeText = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

export const normalizeMerchantName = (value: string) =>
  normalizeText(value)
    .replace(/\s+-\s+PARCELA\s+\d+\s*\/\s*\d+/i, "")
    .replace(/\bPARCELA\s+\d+\s*\/\s*\d+\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

export const parseIsoDate = (value: string) => {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error(`Data invalida: ${value}`);
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`Data invalida: ${value}`);
  return trimmed;
};

export const parseBrazilianMoney = (value: string) => {
  const trimmed = value.trim();
  const isNegative = trimmed.includes("-");
  const cleaned = trimmed
    .replace(/-/g, "")
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`Valor invalido: ${value}`);
  return (isNegative ? -Math.abs(parsed) : parsed).toFixed(2);
};

export const formatDecimal = (value: number) => value.toFixed(2);

export const sha256Hex = async (value: string | ArrayBuffer) => {
  const data = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const detectInstallment = (description: string) => {
  const match = description.match(/(?:-\s*)?parcela\s+(\d+)\s*\/\s*(\d+)/i);
  if (!match) return { normalizedDescription: description.trim() };
  const current = Number(match[1]);
  const total = Number(match[2]);
  return {
    installmentCurrent: Number.isFinite(current) ? current : undefined,
    installmentTotal: Number.isFinite(total) ? total : undefined,
    normalizedDescription: description.replace(match[0], "").replace(/\s+-\s*$/, "").trim(),
  };
};

export const suggestCategoryName = (description: string, direction: TransactionDirection) => {
  const normalized = normalizeText(description);
  if (direction === "CREDIT") {
    if (normalized.includes("RENDIMENTO")) return "Rendimentos";
    if (normalized.includes("SALARIO") || normalized.includes("SALARIO")) return "Salario";
    return "Outros (Receita)";
  }

  if (["DOMINO", "IFOOD", "RAPPI", "SALADEX", "RESTAURANTE", "LANCH", "PIZZA"].some((term) => normalized.includes(term))) {
    return "Alimentacao";
  }
  if (["RENNER", "VESTUARIO", "ROUPA"].some((term) => normalized.includes(term))) return "Vestuário";
  if (["ENEL", "COELCE"].some((term) => normalized.includes(term))) return "Energia";
  if (normalized.includes("CAGECE")) return "Agua";
  if (["TIM", "VIVO", "CLARO", "OI"].some((term) => normalized.includes(term))) return "Internet";
  if (["UBER", "99 ", "99POP", "99APP", "TAXI"].some((term) => normalized.includes(term))) return "Transporte";
  if (["NETFLIX", "SPOTIFY", "MAX", "DISNEY", "PRIME VIDEO"].some((term) => normalized.includes(term))) return "Assinaturas";
  if (["FARMACIA", "DROGARIA", "DROGA"].some((term) => normalized.includes(term))) return "Farmacia";
  if (["PIX ENVIADO", "TRANSFERENCIA", "TED", "DOC"].some((term) => normalized.includes(term))) return "Entre Contas";
  return "Outros";
};

export const getTransactionFingerprint = async (input: {
  institution: InstitutionCode;
  accountHint?: string;
  transactionDate: string;
  amount: string;
  descriptionNormalized: string;
  direction: TransactionDirection;
  installmentCurrent?: number;
  installmentTotal?: number;
}) =>
  sha256Hex(
    [
      input.institution,
      input.accountHint || "",
      input.transactionDate,
      input.amount,
      input.descriptionNormalized,
      input.direction,
      input.installmentCurrent || "",
      input.installmentTotal || "",
    ].join("|"),
  );

export const markDuplicates = (transactions: NormalizedTransaction[], existing: ExistingTransactionMatch[]) => {
  const externalIds = new Set(existing.map((tx) => tx.external_id).filter(Boolean));
  const fingerprints = new Set(existing.map((tx) => tx.fingerprint).filter(Boolean));

  return transactions.map((tx) => ({
    ...tx,
    possibleDuplicate: Boolean((tx.externalId && externalIds.has(tx.externalId)) || fingerprints.has(tx.fingerprint)),
  }));
};

export const isLikelyInternalTransfer = (description: string) => {
  const normalized = normalizeText(description);
  return [
    "DINHEIRO RESERVADO",
    "DINHEIRO RETIRADO",
    "COFRINHO",
    "PIX ENVIADO",
    "PIX RECEBIDO",
    "PAGAMENTO DE CARTAO",
    "FATURA",
  ].some((term) => normalized.includes(term));
};
