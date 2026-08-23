/** Normaliza valores retornados pela IA como número ou moeda brasileira. */
export const parseAiFinancialAmount = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;

  const cleaned = raw.trim().replace(/R\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0;
    if (dots > 1) normalized = cleaned.replace(/\./g, "");
  }

  const amount = Math.abs(Number(normalized));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};
