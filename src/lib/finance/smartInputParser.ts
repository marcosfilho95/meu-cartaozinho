export type SmartPaymentMethod = "pix" | "boleto" | "credit" | "debit" | "cash";

export type SmartTransactionType = "income" | "expense" | "transfer";

export interface SmartParsedTransaction {
  type: SmartTransactionType;
  role: "income" | "expense" | "transfer" | "investment_in" | "investment_out" | "yield" | "refund" | "fee";
  amount: number;
  description: string;
  date: string;
  payment_method: SmartPaymentMethod | null;
  category_hint: string | null;
  institution: string | null;
  explicit_day: number | null;
  explicit_month: number | null;
  explicit_year: number | null;
  confidence: number;
  transfer_direction: "in" | "out" | null;
}

export interface SmartAccount {
  id: string;
  name: string;
  institution?: string | null;
  type?: string | null;
}

const INSTITUTIONS = [
  { name: "Mercado Pago", aliases: ["mercado pago", "mercadopago", "mp"] },
  { name: "Banco do Brasil", aliases: ["banco do brasil", "bb"] },
  { name: "Amazon Prime", aliases: ["amazon prime", "amazon"] },
  { name: "Nubank", aliases: ["nubank", "roxinho", "nu"] },
  { name: "C6", aliases: ["c6 bank", "c6"] },
  { name: "PicPay", aliases: ["picpay"] },
  { name: "Santander", aliases: ["santander"] },
  { name: "Bradesco", aliases: ["bradesco"] },
  { name: "Itaú", aliases: ["itau"] },
  { name: "Caixa", aliases: ["caixa economica", "caixa"] },
] as const;

const MONTHS: Array<[number, string[]]> = [
  [1, ["janeiro", "jan"]],
  [2, ["fevereiro", "fev"]],
  [3, ["marco", "mar"]],
  [4, ["abril", "abr"]],
  [5, ["maio", "mai"]],
  [6, ["junho", "jun"]],
  [7, ["julho", "jul"]],
  [8, ["agosto", "ago"]],
  [9, ["setembro", "set"]],
  [10, ["outubro", "out"]],
  [11, ["novembro", "nov"]],
  [12, ["dezembro", "dez"]],
];

export const normalizeText = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[-_]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const containsPhrase = (normalizedText: string, phrase: string): boolean => {
  const escaped = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(` ${normalizedText} `);
};

export const parseBrazilianCurrency = (raw: string): number | null => {
  const cleaned = raw.replace(/r\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;

  let normalized = cleaned;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const decimals = cleaned.length - dot - 1;
    normalized = decimals === 3 ? cleaned.replace(/\./g, "") : cleaned;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const extractAmount = (text: string): number | null => {
  const tokenPattern = /(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi;
  const candidates = [...text.matchAll(tokenPattern)].flatMap((match) => {
    const raw = match[0];
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 18), index);
    const after = text.slice(index + raw.length, index + raw.length + 12);
    const digits = raw.replace(/\D/g, "");
    const amount = parseBrazilianCurrency(raw);
    if (amount === null) return [];
    if (/(?:\/|-)\s*$/.test(before) || /^\s*(?:\/|-)/.test(after)) return [];
    if (/\b(?:dia|ano)\s*$/i.test(before) && !/r\$/i.test(raw)) return [];
    if (amount <= 31 && /^\s*(?:de\s+)?(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.test(after)) return [];
    if (digits.length === 4 && amount >= 1900 && amount <= 2200 && !/r\$|reais?/i.test(`${raw}${after}`)) return [];
    const score = (/r\$/i.test(raw) ? 5 : 0) + (/^\s*reais?\b/i.test(after) ? 4 : 0) + (amount > 31 ? 2 : 0);
    return [{ amount, score, index }];
  });
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.amount ?? null;
};

export const extractInstitution = (text: string): string | null => {
  const normalized = normalizeText(text);
  for (const institution of INSTITUTIONS) {
    if (institution.aliases.some((alias) => containsPhrase(normalized, alias))) return institution.name;
  }
  return null;
};

const extractDateParts = (text: string, referenceDate: Date) => {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  const fullDate = normalized.match(/\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b/);
  if (fullDate) {
    day = Number(fullDate[1]);
    month = Number(fullDate[2]);
    year = Number(fullDate[3]);
  } else {
    const yearMonth = normalized.match(/\b((?:19|20)\d{2})[/-](0?[1-9]|1[0-2])\b/);
    const monthYear = normalized.match(/\b(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b/);
    if (yearMonth) {
      year = Number(yearMonth[1]);
      month = Number(yearMonth[2]);
    } else if (monthYear) {
      month = Number(monthYear[1]);
      year = Number(monthYear[2]);
    }
  }

  if (month === null) {
    for (const [number, aliases] of MONTHS) {
      if (aliases.some((alias) => containsPhrase(normalized, alias))) {
        month = number;
        break;
      }
    }
  }

  if (year === null) {
    const yearMatch = normalized.match(/\b((?:19|20)\d{2})\b/);
    if (yearMatch) year = Number(yearMatch[1]);
  }

  if (day === null) {
    const dayMatch = normalized.match(/\b(?:vencimento(?:\s+no)?|vence(?:\s+no)?|dia)\s*(?:dia\s*)?(0?[1-9]|[12]\d|3[01])\b/);
    if (dayMatch) day = Number(dayMatch[1]);
  }

  if (/\bontem\b/.test(normalized)) {
    const yesterday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - 1);
    return {
      day: yesterday.getDate(),
      month: yesterday.getMonth() + 1,
      year: yesterday.getFullYear(),
    };
  }

  return { day, month, year };
};

const safeIsoDate = (year: number, month: number, day: number): string => {
  const lastDay = new Date(year, month, 0).getDate();
  const validDay = Math.max(1, Math.min(day, lastDay));
  return `${year}-${String(month).padStart(2, "0")}-${String(validDay).padStart(2, "0")}`;
};

const inferType = (normalized: string): SmartTransactionType => {
  if (/\b(?:recebi|receita|salario|rendimento|dividendo|ganhei|reembolso)\b/.test(normalized)) return "income";
  if (/\b(?:transferi|transferencia|aporte|apliquei|aplicacao|resgatei|resgate|pix enviado|pix recebido)\b/.test(normalized)) return "transfer";
  return "expense";
};

const inferPaymentMethod = (normalized: string, institution: string | null): SmartPaymentMethod | null => {
  if (/\bpix\b/.test(normalized)) return "pix";
  if (/\bboleto\b/.test(normalized)) return "boleto";
  if (/\bdinheiro\b|\bespecie\b/.test(normalized)) return "cash";
  if (/\bdebito\b/.test(normalized)) return "debit";
  if (/\bcredito\b|\bcartao\b|\bfatura\b/.test(normalized) || (institution && /\bfatura\b/.test(normalized))) return "credit";
  return null;
};

const inferCategory = (normalized: string): string | null => {
  if (/\buber\b|\b99\b|\btaxi\b/.test(normalized)) return "Uber e Táxi";
  if (/\bgasolina\b|\bcombustivel\b|\bposto\b/.test(normalized)) return "Gasolina";
  if (/\bsalario\b/.test(normalized)) return "Salário";
  return null;
};

const buildDescription = (normalized: string, institution: string | null, type: SmartTransactionType): string => {
  if (/\bfatura\b/.test(normalized) && institution) return `Fatura ${institution}`;
  if (/\buber\b/.test(normalized)) return "Uber";
  if (/\bgasolina\b|\bcombustivel\b/.test(normalized)) return "Gasolina";
  if (/\bsalario\b/.test(normalized)) return "Salário";
  if (institution) return institution;
  return type === "income" ? "Receita" : type === "transfer" ? "Transferência" : "Despesa";
};

export const parseDeterministicTransaction = (
  text: string,
  referenceDate = new Date(),
): SmartParsedTransaction | null => {
  const amount = extractAmount(text);
  if (amount === null) return null;

  const normalized = normalizeText(text);
  const institution = extractInstitution(text);
  const parts = extractDateParts(text, referenceDate);
  const year = parts.year ?? referenceDate.getFullYear();
  const month = parts.month ?? referenceDate.getMonth() + 1;
  const day = parts.day ?? 5;
  const type = inferType(normalized);
  const paymentMethod = inferPaymentMethod(normalized, institution);

  return {
    type,
    role: type,
    amount,
    description: buildDescription(normalized, institution, type),
    date: safeIsoDate(year, month, day),
    payment_method: paymentMethod,
    category_hint: inferCategory(normalized),
    institution,
    explicit_day: parts.day,
    explicit_month: parts.month,
    explicit_year: parts.year,
    confidence: institution || parts.month !== null ? 0.85 : 0.75,
    transfer_direction: null,
  };
};

const isInstitutionCategory = (category: unknown, institution: string | null): boolean => {
  if (typeof category !== "string") return false;
  const normalizedCategory = normalizeText(category);
  if (institution && normalizedCategory === normalizeText(institution)) return true;
  return INSTITUTIONS.some((item) => [item.name, ...item.aliases].some((alias) => normalizedCategory === normalizeText(alias)));
};

export const mergeAiWithDeterministicResult = (
  ai: Partial<SmartParsedTransaction> | null | undefined,
  local: SmartParsedTransaction,
): SmartParsedTransaction => {
  const aiCategory = isInstitutionCategory(ai?.category_hint, local.institution) ? null : ai?.category_hint;
  const compatibleRoles: Record<SmartTransactionType, SmartParsedTransaction["role"][]> = {
    expense: ["expense", "fee"],
    income: ["income", "yield", "refund"],
    transfer: ["transfer", "investment_in", "investment_out"],
  };
  const role = ai?.role && compatibleRoles[local.type].includes(ai.role) ? ai.role : local.role;
  return {
    type: local.type,
    role,
    amount: local.amount,
    description: local.institution && normalizeText(local.description).startsWith("fatura ")
      ? local.description
      : String(ai?.description || local.description),
    date: local.date,
    payment_method: local.payment_method ?? ai?.payment_method ?? null,
    category_hint: local.category_hint ?? aiCategory ?? null,
    institution: local.institution ?? ai?.institution ?? null,
    explicit_day: local.explicit_day,
    explicit_month: local.explicit_month,
    explicit_year: local.explicit_year,
    confidence: Math.max(local.confidence, Number(ai?.confidence || 0)),
    transfer_direction: ai?.transfer_direction ?? local.transfer_direction,
  };
};

export const matchAccountByInstitution = (
  accounts: SmartAccount[],
  institution: string | null | undefined,
): string => {
  if (!institution) return "";
  const canonical = INSTITUTIONS.find((item) => normalizeText(item.name) === normalizeText(institution));
  const needles = canonical ? [canonical.name, ...canonical.aliases].map(normalizeText) : [normalizeText(institution)];
  const match = accounts.find((account) => {
    const haystacks = [account.name, account.institution || ""].map(normalizeText);
    return haystacks.some((haystack) => needles.some((needle) => (
      containsPhrase(haystack, needle) || (needle.length > 2 && haystack.includes(needle))
    )));
  });
  return match?.id || "";
};
