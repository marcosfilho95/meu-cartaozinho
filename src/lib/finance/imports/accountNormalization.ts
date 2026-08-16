import type { FinancialDocumentType, InstitutionCode, NormalizedTransaction } from "./types";
import { normalizeText } from "./utils";

const CATEGORY_LIKE_ACCOUNT_NAMES = new Set([
  "ALIMENTACAO",
  "GASOLINA",
  "COMPRAS ONLINE",
  "MERCADO",
  "RESTAURANTE",
  "TRANSPORTE",
  "LAZER",
  "SAUDE",
  "FARMACIA",
  "OUTROS",
]);

const KNOWN_ACCOUNT_NAMES: Array<[RegExp, string]> = [
  [/^(?:MERCADO PAGO|MERCADOPAGO|MP)$/, "Mercado Pago"],
  [/^NUBANK$/, "Nubank"],
  [/^PICPAY$/, "PicPay"],
  [/^C6(?: BANK)?$/, "C6"],
  [/^BRADESCARD$/, "Bradescard"],
  [/^BRADESCO$/, "Bradesco"],
];

export const normalizeImportedAccountName = (
  value: string | null | undefined,
  context: { institution?: InstitutionCode; documentType?: FinancialDocumentType } = {},
) => {
  const raw = String(value || "").trim();
  const normalized = normalizeText(raw);
  if (!normalized || CATEGORY_LIKE_ACCOUNT_NAMES.has(normalized)) return undefined;

  for (const [pattern, canonical] of KNOWN_ACCOUNT_NAMES) {
    if (pattern.test(normalized)) return canonical;
  }
  if (
    normalized === "MERCADO LIVRE"
    && context.institution === "MERCADO_PAGO"
    && context.documentType === "CREDIT_CARD_STATEMENT"
  ) return "Mercado Pago";

  return raw;
};

const normalizedAccountLabel = (value: string) => normalizeText(value).replace(/\s+/g, " ").trim();

export type ImportedAccountOption = {
  id: string;
  name: string;
  type: string;
  institution?: string | null;
};

const accountMatchesName = (account: ImportedAccountOption, requestedName: string) => {
  const target = normalizedAccountLabel(requestedName);
  const candidates = [account.name, account.institution || ""]
    .map((value) => normalizeImportedAccountName(value) || value)
    .map(normalizedAccountLabel)
    .filter(Boolean);
  return candidates.some((candidate) =>
    candidate === target || candidate.includes(target) || target.includes(candidate),
  );
};

export const findImportedAccountIdByName = (
  requestedName: string | null | undefined,
  accounts: ImportedAccountOption[],
  context: { institution?: InstitutionCode; documentType?: FinancialDocumentType } = {},
) => {
  const normalizedName = normalizeImportedAccountName(requestedName, context);
  if (!normalizedName) return "";
  return accounts.find((account) => accountMatchesName(account, normalizedName))?.id || "";
};

/** Resolve conta obedecendo: coluna explícita > instituição detectada > fallback. */
export const resolveImportedAccountId = (
  row: NormalizedTransaction,
  accounts: ImportedAccountOption[],
) => {
  const explicitName = normalizeImportedAccountName(row.sourceAccountName, {
    institution: row.institution,
    documentType: row.sourceType === "CREDIT_CARD" ? "CREDIT_CARD_STATEMENT" : "BANK_STATEMENT",
  });
  if (explicitName) {
    // Uma conta explícita não pode cair silenciosamente em outra conta. Se ela
    // ainda não estiver cadastrada, a revisão fica sem conta para o usuário
    // criar/selecionar a correta.
    return findImportedAccountIdByName(explicitName, accounts);
  }

  const isCard = row.sourceType === "CREDIT_CARD";
  const validAccounts = accounts.filter((account) =>
    Boolean(normalizeImportedAccountName(account.name) || normalizeImportedAccountName(account.institution)),
  );
  const eligible = validAccounts.filter((account) => (isCard ? account.type === "credit_card" : account.type !== "credit_card"));
  const pool = eligible.length > 0 ? eligible : validAccounts;
  if (row.institution !== "UNKNOWN") {
    const institutionName = normalizeImportedAccountName(row.institution.replace("_", " ")) || row.institution;
    const institutionMatch = pool.find((account) => accountMatchesName(account, institutionName));
    // A instituição identificada no documento também é evidência forte. Se a
    // conta não existe, não devemos apontar para outra só porque ela é a primeira.
    return institutionMatch?.id || "";
  }

  return pool[0]?.id || "";
};
