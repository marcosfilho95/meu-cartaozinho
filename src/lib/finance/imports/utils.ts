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
  if (!trimmed) throw new Error(`Valor invalido: ${value}`);
  const isNegative = /-/.test(trimmed) || /^\(.*\)$/.test(trimmed);
  let raw = trimmed
    .replace(/[()]/g, "")
    .replace(/-/g, "")
    .replace(/^R\$\s*/i, "")
    .replace(/[Uu][Ss]?\$\s*/g, "")
    .replace(/\s/g, "");
  if (!raw) throw new Error(`Valor invalido: ${value}`);

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    // Assume last punctuation is the decimal separator.
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      // BR style: 1.234,56
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      // US style: 1,234.56
      normalized = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    // BR decimal: 1234,56
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // Ambiguous dot. If last dot has 1-2 digits after it treat as decimal, else as thousand.
    const lastDot = raw.lastIndexOf(".");
    const decimals = raw.length - lastDot - 1;
    normalized = decimals >= 1 && decimals <= 2 ? raw : raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }

  const parsed = Number(normalized);
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

const hasAny = (normalized: string, terms: string[]) => terms.some((term) => normalized.includes(term));

export const suggestCategoryName = (description: string, direction: TransactionDirection) => {
  const normalized = normalizeText(description);
  if (direction === "CREDIT") {
    if (normalized.includes("RENDIMENTO")) return "Rendimentos";
    if (normalized.includes("SALARIO")) return "Salario";
    if (hasAny(normalized, ["CASHBACK", "ESTORNO", "REEMBOLSO", "DEVOLUCAO"])) return "Reembolsos";
    if (hasAny(normalized, ["FREELANCE", "SERVICO", "HONORARIO", "COMISSAO"])) return "Servicos";
    if (hasAny(normalized, ["DIVIDENDO", "JUROS", "APLICACAO"])) return "Rendimentos";
    return "Outros (Receita)";
  }

  if (
    hasAny(normalized, [
      "ACAI",
      "ATACADAO",
      "BAR ",
      "BEBIDA",
      "BISTRO",
      "BOB S",
      "BOLARIA",
      "BURGER",
      "CAFE",
      "CARREFOUR",
      "CHURRASC",
      "COCO BAMBU",
      "COMETA",
      "DELIVERY",
      "DOMINO",
      "EXTRA",
      "HORTIFRUT",
      "IFOOD",
      "LANCH",
      "MCDONALD",
      "MERCADINHO",
      "MERCADO",
      "PADARIA",
      "PANIFICADORA",
      "PIZZA",
      "PIZZARIA",
      "RAPPI",
      "RESTAURANTE",
      "SALADEX",
      "SAO LUIZ",
      "SUPERMERCADO",
      "SUPER DO POVO",
      "TIO ARMENIO",
      "UBER EATS",
    ])
  ) {
    return "Alimentacao";
  }

  if (hasAny(normalized, [
    "AMARO", "C&A", "CEA", "CENTAURO", "DAFITI", "HERING", "LEADER", "MARISA",
    "NIKE", "PERNAMBUCANAS", "RENNER", "RIACHUELO", "SHEIN", "SHOPEE", "VESTUARIO", "ROUPA",
  ])) {
    return "Vestuario";
  }
  if (hasAny(normalized, ["ENEL", "COELCE", "CEMIG", "COPEL", "LIGHT", "ENERGISA", "EQUATORIAL"])) return "Energia";
  if (hasAny(normalized, ["CAGECE", "SABESP", "COPASA", "SANEPAR", "AGUA"])) return "Agua";
  if (hasAny(normalized, ["ALGAR", "CLARO", "GVT", "INTERNET", "NET ", "OI ", "SKY", "TIM ", "VIVO"])) return "Internet";
  if (hasAny(normalized, [
    "99 ", "99APP", "99POP", "AZUL", "COMBUSTIVEL", "ESTACIONAMENTO", "GASOLINA",
    "GOL", "IPIRANGA", "LATAM", "METRO", "ONIBUS", "PEDAGIO", "POSTO", "SHELL",
    "TAXI", "UBER", "ZULMG",
  ])) return "Transporte";
  if (hasAny(normalized, [
    "AMAZON PRIME", "APPLE.COM", "APPLE MUSIC", "AUDIBLE", "CANVA", "CHATGPT",
    "CLARO VIDEO", "CRUNCHYROLL", "DAZN", "DEEZER", "DISNEY", "GLOBOPLAY",
    "GOOGLE", "HBO", "ICLOUD", "MAX", "MICROSOFT", "NETFLIX", "OPENAI",
    "PARAMOUNT", "PRIME VIDEO", "SPOTIFY", "STAR PLUS", "TIDAL", "TWITCH", "YOUTUBE",
  ])) {
    return "Assinaturas";
  }
  if (hasAny(normalized, [
    "CLINICA", "CONSULTA", "DENTISTA", "DISTRIMEDICAL", "DROGA", "DROGARIA",
    "EXAME", "FARMACIA", "HOSPITAL", "LABORATORIO", "MEDICO", "PAGUE MENOS",
    "PANVEL", "RAIA", "UNIMED",
  ])) return "Saude";
  if (hasAny(normalized, [
    "CURSO", "ESCOLA", "FACULDADE", "LIVRARIA", "SAS ", "TREINAMENTO",
    "UDEMY", "UNIVERSIDADE", "UP TRAINING",
  ])) return "Educacao";
  if (hasAny(normalized, [
    "AIRBNB", "BOOKING", "CINEMA", "DECOLAR", "HOTEL", "INGRESSO", "KOP",
    "LAZER", "PLAY", "POUSADA", "RESORT", "SHOW", "TICKET", "VIAGEM",
  ])) return "Lazer";
  if (hasAny(normalized, ["ALUGUEL", "CONDOMINIO", "IPTU", "MORADIA"])) return "Moradia";
  if (hasAny(normalized, ["MERCADO LIVRE", "MAGALU", "AMAZON.COM", "AMAZONBR", "ALIEXPRESS", "SHOPPING"])) return "Compras";
  if (hasAny(normalized, ["ANUIDADE", "TARIFA", "JUROS", "IOF", "MULTA"])) return "Taxas Bancarias";
  if (hasAny(normalized, ["PIX ENVIADO", "PIX RECEBIDO", "TRANSFERENCIA", "TED", "DOC", "PAGAMENTO DE FATURA"])) return "Entre Contas";
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
