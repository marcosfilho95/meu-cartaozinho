/**
 * Integração mensal agregada entre o "Meu Cartãozinho" e o Organizador.
 *
 * Regras:
 * - Uma única receita prevista por mês, identificada por `meu_cartaozinho:AAAA-MM`
 *   no campo `external_id` (idempotente: nunca duplica).
 * - Não recria os antigos lançamentos individuais por parcela.
 * - Se o total do mês mudar, a receita é atualizada; se zerar, é removida
 *   (somente quando ainda estiver como prevista/pendente).
 */
import { supabase } from "@/integrations/supabase/client";

export const CARTAOZINHO_CATEGORY = "Meu Cartãozinho";

export const cartaozinhoExternalId = (refMonth: string) => `meu_cartaozinho:${refMonth}`;

export type CartaozinhoMonthTotal = {
  refMonth: string;
  total: number;
  installments: number;
  people: number;
};

export type CartaozinhoInstallmentRow = {
  amount: number | string | null;
  ref_month: string;
  purchases?: { person?: string | null } | null;
};

/**
 * Agrega linhas de parcelas sem acessar o banco. Mantê-la pura torna a regra
 * de soma, contagem e deduplicação de pessoas fácil de testar.
 */
export const aggregateCartaozinhoRows = (
  refMonths: string[],
  rows: CartaozinhoInstallmentRow[],
): Record<string, CartaozinhoMonthTotal> => {
  const totals: Record<string, CartaozinhoMonthTotal> = {};
  const peopleByMonth = new Map<string, Set<string>>();

  refMonths.forEach((month) => {
    totals[month] = { refMonth: month, total: 0, installments: 0, people: 0 };
  });

  rows.forEach((row) => {
    const entry = totals[row.ref_month];
    if (!entry) return;
    entry.total = Math.round((entry.total + (Number(row.amount) || 0)) * 100) / 100;
    entry.installments += 1;
    const person = String(row.purchases?.person || "").trim().toLocaleLowerCase("pt-BR");
    if (!person) return;
    const people = peopleByMonth.get(row.ref_month) || new Set<string>();
    people.add(person);
    peopleByMonth.set(row.ref_month, people);
  });

  Object.values(totals).forEach((entry) => {
    entry.people = peopleByMonth.get(entry.refMonth)?.size ?? 0;
  });

  return totals;
};

/** Soma as parcelas a receber do Cartãozinho em cada mês informado. */
export const fetchCartaozinhoMonthTotals = async (
  userId: string,
  refMonths: string[],
): Promise<Record<string, CartaozinhoMonthTotal>> => {
  if (refMonths.length === 0) return {};

  const { data, error } = await supabase
    .from("installments")
    .select("amount, ref_month, purchases(person)")
    .eq("user_id", userId)
    .in("ref_month", refMonths);

  if (error) throw error;

  return aggregateCartaozinhoRows(refMonths, (data || []) as CartaozinhoInstallmentRow[]);
};

const resolveCategoryId = async (userId: string) => {
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", userId)
    .eq("kind", "income")
    .limit(200);

  const normalized = (value: string) =>
    value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const existing = (data || []).find((cat) => normalized(cat.name) === normalized(CARTAOZINHO_CATEGORY));
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: CARTAOZINHO_CATEGORY, kind: "income", icon: "credit-card", color: "#0EA5A4" })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
};

const resolveAccountId = async (userId: string) => {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const accounts = data || [];
  const preferred = accounts.find((account) => account.type === "checking") ||
    accounts.find((account) => account.type === "cash") ||
    accounts.find((account) => account.type !== "credit_card");
  return preferred?.id || accounts[0]?.id || null;
};

export type CartaozinhoSyncResult = {
  refMonth: string;
  total: number;
  action: "created" | "updated" | "removed" | "unchanged" | "skipped";
};

/** Sincroniza (idempotente) a receita prevista agregada do mês. */
export const syncCartaozinhoMonth = async (
  userId: string,
  refMonth: string,
): Promise<CartaozinhoSyncResult> => {
  const totals = await fetchCartaozinhoMonthTotals(userId, [refMonth]);
  const total = totals[refMonth]?.total ?? 0;
  const externalId = cartaozinhoExternalId(refMonth);

  const { data: existingRows, error: findError } = await supabase
    .from("transactions")
    .select("id, amount, status")
    .eq("user_id", userId)
    .eq("external_id", externalId)
    .is("deleted_at", null)
    .limit(1);
  if (findError) throw findError;
  const existing = existingRows?.[0];

  if (total <= 0) {
    if (existing && existing.status !== "paid") {
      await supabase.from("transactions").delete().eq("id", existing.id);
      return { refMonth, total: 0, action: "removed" };
    }
    return { refMonth, total: 0, action: existing ? "skipped" : "unchanged" };
  }

  if (existing) {
    if (Math.round(Number(existing.amount) * 100) === Math.round(total * 100)) {
      return { refMonth, total, action: "unchanged" };
    }
    if (existing.status === "paid") return { refMonth, total, action: "skipped" };
    const { error } = await supabase
      .from("transactions")
      .update({ amount: total })
      .eq("id", existing.id);
    if (error) throw error;
    return { refMonth, total, action: "updated" };
  }

  const accountId = await resolveAccountId(userId);
  if (!accountId) return { refMonth, total, action: "skipped" };
  const categoryId = await resolveCategoryId(userId);

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    account_id: accountId,
    category_id: categoryId,
    type: "income",
    amount: total,
    status: "pending",
    transaction_date: `${refMonth}-01`,
    competence_month: refMonth,
    external_id: externalId,
    source: "cartaozinho_sync",
    source_origin: "integration",
    description_original: `Meu Cartãozinho — ${refMonth}`,
    notes: `Meu Cartãozinho — ${refMonth}`,
    metadata: { integration: "meu_cartaozinho", ref_month: refMonth },
  });
  if (error) throw error;
  return { refMonth, total, action: "created" };
};

/** Sincroniza vários meses (usado ao abrir a Home e o painel do Organizador). */
export const syncCartaozinhoMonths = async (userId: string, refMonths: string[]) => {
  const results: CartaozinhoSyncResult[] = [];
  for (const month of refMonths) {
    try {
      results.push(await syncCartaozinhoMonth(userId, month));
    } catch (error) {
      console.error("[cartaozinhoSync]", month, error);
    }
  }
  return results;
};
