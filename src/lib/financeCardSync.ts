import { supabase } from "@/integrations/supabase/client";
import { clearFinancePageCaches } from "@/lib/financePageCache";
import { clearDashboardCache } from "@/lib/dashboardCache";

type SyncInstallment = {
  id: string;
  purchase_id: string;
  card_id: string;
  installment_number: number;
  installments_count: number;
  ref_month: string;
  due_day: number;
  amount: number;
  status: string;
};

type SyncPurchase = {
  id: string;
  description: string;
  card_id: string;
  cards?: {
    name: string;
    brand: string | null;
  } | null;
};

const BANK_COLORS: Record<string, string> = {
  nubank: "#8A05BE",
  "mercado pago": "#009EE3",
  mercadopago: "#009EE3",
  picpay: "#21C25E",
  itau: "#EC7000",
  "banco do brasil": "#F7C400",
  bb: "#F7C400",
  bradesco: "#CC092F",
  santander: "#EC0000",
  caixa: "#005CA8",
  c6: "#111111",
  inter: "#FF7A00",
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const pad2 = (n: number) => String(n).padStart(2, "0");

const installmentMarker = (installmentId: string, purchaseId: string, cardId: string) =>
  `mc_sync_installment:${installmentId};purchase:${purchaseId};card:${cardId}`;

const invalidateFinanceCaches = (userId: string) => {
  clearFinancePageCaches(userId);
  clearDashboardCache(userId);
  try {
    window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
  } catch {
    // ignore browser event failures
  }
};

const toFinanceStatus = (status: string, refMonth: string) => {
  const normalized = normalize(status || "");
  if (normalized.includes("pago")) return "paid";
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (refMonth < currentMonth) return "overdue";
  return "pending";
};

const toTransactionDate = (refMonth: string, dueDay: number) => {
  const day = Math.max(1, Math.min(28, Number(dueDay) || 1));
  return `${refMonth}-${pad2(day)}`;
};

const ensureFinanceAccount = async (userId: string) => {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  const rows = data || [];
  const credit = rows.find((item) => item.type === "credit_card");
  if (credit) return credit.id;
  return rows[0]?.id || null;
};

const ensureCardsCategory = async (userId: string) => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id, color")
    .eq("user_id", userId)
    .eq("kind", "expense");

  if (error) throw error;
  const rows = data || [];
  const parent = rows.find((item) => !item.parent_id && normalize(item.name || "") === "cartoes");
  if (parent) return { parentId: parent.id, rows };

  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name: "Cartões",
      kind: "expense",
      color: "#6366F1",
      icon: "credit-card",
      is_system: true,
      parent_id: null,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return { parentId: inserted.id, rows };
};

const resolveBankColor = (cardName?: string | null, brand?: string | null) => {
  const normalizedName = normalize(cardName || "");
  const normalizedBrand = normalize(brand || "");
  const candidate = `${normalizedName} ${normalizedBrand}`.trim();
  const direct = BANK_COLORS[normalizedBrand] || BANK_COLORS[normalizedName];
  if (direct) return direct;

  const byContains = Object.entries(BANK_COLORS).find(([key]) => candidate.includes(key));
  if (byContains) return byContains[1];

  return "#7C3AED";
};

const ensureCardSubcategory = async (userId: string, cardName: string, brand?: string | null) => {
  const { parentId, rows } = await ensureCardsCategory(userId);
  const normalizedCard = normalize(cardName || "Cartão");
  const bankColor = resolveBankColor(cardName, brand);

  const child = rows.find(
    (item) =>
      item.parent_id === parentId &&
      item.kind === "expense" &&
      normalize(item.name || "") === normalizedCard,
  );
  if (child) {
    if (child.color !== bankColor) {
      await supabase.from("categories").update({ color: bankColor }).eq("id", child.id);
    }
    return child.id;
  }

  const { data: inserted, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name: cardName || "Cartão",
      kind: "expense",
      color: bankColor,
      icon: "credit-card",
      is_system: true,
      parent_id: parentId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
};

const syncSinglePurchase = async (userId: string, purchase: SyncPurchase, installments: SyncInstallment[]) => {
  if (installments.length === 0) return;
  const accountId = await ensureFinanceAccount(userId);
  if (!accountId) return;

  const cardName = purchase.cards?.name || "Cartão";
  const categoryId = await ensureCardSubcategory(userId, cardName, purchase.cards?.brand);

  const markers = installments.map((item) => installmentMarker(item.id, item.purchase_id, item.card_id));
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("id, notes")
    .eq("user_id", userId)
    .in("notes", markers);
  if (existingError) throw existingError;

  const existingByNote = new Map<string, { id: string }>();
  (existing || []).forEach((tx) => {
    if (tx.notes) existingByNote.set(tx.notes, { id: tx.id });
  });

  const inserts: any[] = [];
  const updates: Array<{ id: string; payload: any }> = [];

  for (const installment of installments) {
    const marker = installmentMarker(installment.id, installment.purchase_id, installment.card_id);
    const transactionDate = toTransactionDate(installment.ref_month, installment.due_day);
    const payload = {
      user_id: userId,
      account_id: accountId,
      category_id: categoryId,
      type: "expense" as const,
      amount: Number(installment.amount || 0),
      transaction_date: transactionDate,
      due_date: transactionDate,
      status: toFinanceStatus(installment.status, installment.ref_month) as "pending" | "paid" | "overdue",
      payment_method: "credit",
      source: `${purchase.description} (${installment.installment_number}/${installment.installments_count})`,
      notes: marker,
      recurrence_id: null,
      payee_id: null,
      counterpart_account_id: null,
    };

    const existingTx = existingByNote.get(marker);
    if (existingTx) {
      updates.push({ id: existingTx.id, payload });
    } else {
      inserts.push(payload);
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("transactions").insert(inserts);
    if (error) throw error;
  }

  for (const update of updates) {
    const { error } = await supabase.from("transactions").update(update.payload).eq("id", update.id);
    if (error) throw error;
  }
};

export const syncPurchasesToFinanceByIds = async (userId: string, purchaseIds: string[]) => {
  const ids = Array.from(new Set(purchaseIds.filter(Boolean)));
  if (ids.length === 0) return;

  const [{ data: purchases, error: purchasesError }, { data: installments, error: installmentsError }] =
    await Promise.all([
      supabase
        .from("purchases")
        .select("id, description, card_id, cards(name, brand)")
        .eq("user_id", userId)
        .in("id", ids),
      supabase
        .from("installments")
        .select("id, purchase_id, card_id, installment_number, installments_count, ref_month, due_day, amount, status")
        .eq("user_id", userId)
        .in("purchase_id", ids),
    ]);

  if (purchasesError) throw purchasesError;
  if (installmentsError) throw installmentsError;

  const purchaseRows = (purchases || []) as SyncPurchase[];
  const installmentRows = (installments || []) as SyncInstallment[];
  const installmentsByPurchase = new Map<string, SyncInstallment[]>();

  installmentRows.forEach((item) => {
    if (!installmentsByPurchase.has(item.purchase_id)) installmentsByPurchase.set(item.purchase_id, []);
    installmentsByPurchase.get(item.purchase_id)?.push(item);
  });

  for (const purchase of purchaseRows) {
    await syncSinglePurchase(userId, purchase, installmentsByPurchase.get(purchase.id) || []);
  }
  invalidateFinanceCaches(userId);
};

export const syncAllCardPurchasesToFinance = async (userId: string) => {
  const { data, error } = await supabase.from("purchases").select("id").eq("user_id", userId);
  if (error) throw error;
  const ids = (data || []).map((item) => item.id);
  if (ids.length === 0) return;
  await syncPurchasesToFinanceByIds(userId, ids);
};

export const deleteSyncedFinanceTransactionsByPurchaseIds = async (userId: string, purchaseIds: string[]) => {
  const ids = Array.from(new Set(purchaseIds.filter(Boolean)));
  if (ids.length === 0) return;

  for (const purchaseId of ids) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .like("notes", `mc_sync_installment:%;purchase:${purchaseId};%`);
    if (error) throw error;
  }
  invalidateFinanceCaches(userId);
};

export const deleteSyncedFinanceTransactionsByCardIds = async (userId: string, cardIds: string[]) => {
  const ids = Array.from(new Set(cardIds.filter(Boolean)));
  if (ids.length === 0) return;

  for (const cardId of ids) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .like("notes", `mc_sync_installment:%;card:${cardId}`);
    if (error) throw error;
  }
  invalidateFinanceCaches(userId);
};
