import { supabase } from "@/integrations/supabase/client";

export type FinanceTx = {
  id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  status: "pending" | "paid" | "overdue" | "canceled";
  transaction_date: string;
  due_date?: string | null;
  account_id: string;
  category_id: string | null;
  source?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  categories?: { id: string; name: string; color: string | null; parent_id: string | null } | null;
  accounts?: { id: string; name: string; type: string; due_day?: number | null; current_balance?: number | null } | null;
};

export const BANK_COLORS: Record<string, string> = {
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

export const PAYMENT_LABELS: Record<string, string> = {
  credit_card: "Cartão de crédito",
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  investment: "Investimento",
  loan: "Empréstimo",
  transferencia: "Transferência",
  other: "Outro",
};

export const PAYMENT_COLORS: Record<string, string> = {
  credit_card: "#7C3AED",
  checking: "#0284C7",
  savings: "#0891B2",
  cash: "#D97706",
  investment: "#16A34A",
  loan: "#EF4444",
  transferencia: "#2563EB",
  other: "#6B7280",
};

export const CATEGORY_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#F0B27A", "#BB8FCE", "#AEB6BF", "#82E0AA"];

export const normalizeLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isGenericCardCategory = (label: string) => {
  const normalized = normalizeLabel(label);
  return [
    "cartao",
    "cartoes",
    "cartao credito",
    "cartoes credito",
    "cartao de credito",
    "cartoes de credito",
  ].includes(normalized);
};

const normalizeLabelBoundaries = (value: string) =>
  value.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const containsNormalizedLabel = (label: string, candidate: string) => {
  const boundedLabel = normalizeLabelBoundaries(label);
  const boundedCandidate = normalizeLabelBoundaries(candidate);
  return boundedLabel === boundedCandidate ||
    boundedLabel.startsWith(`${boundedCandidate} `) ||
    boundedLabel.endsWith(` ${boundedCandidate}`) ||
    boundedLabel.includes(` ${boundedCandidate} `);
};

const AMBIGUOUS_BANK_PATTERNS: Record<string, string[]> = {
  inter: ["banco inter", "conta inter", "cartao inter", "cartao de credito inter"],
  caixa: [
    "caixa economica",
    "caixa tem",
    "banco caixa",
    "conta caixa",
    "conta da caixa",
    "cartao caixa",
    "cartao da caixa",
  ],
  bb: ["banco bb", "conta bb", "cartao bb"],
};

const findBankCategoryColor = (label: string) => {
  const normalized = normalizeLabel(label);
  const direct = BANK_COLORS[normalized];
  if (direct) return direct;

  for (const [key, patterns] of Object.entries(AMBIGUOUS_BANK_PATTERNS)) {
    if (patterns.some((pattern) => containsNormalizedLabel(normalized, pattern))) {
      return BANK_COLORS[key];
    }
  }

  const ambiguousKeys = new Set(Object.keys(AMBIGUOUS_BANK_PATTERNS));
  const match = Object.entries(BANK_COLORS).find(([key]) =>
    !ambiguousKeys.has(key) && containsNormalizedLabel(normalized, normalizeLabel(key)),
  );
  return match?.[1];
};

export const isBankCategory = (label: string) => {
  if (isGenericCardCategory(label)) return false;
  return Boolean(findBankCategoryColor(label));
};

export const resolveBankCategoryColor = (label: string, fallback: string) => {
  return findBankCategoryColor(label) || fallback;
};

export const getPaymentKey = (tx: FinanceTx) => {
  if (tx.type === "transfer") return "transferencia";
  const accountType = tx.accounts?.type || "other";
  return PAYMENT_LABELS[accountType] ? accountType : "other";
};

export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const addMonthsToKey = (key: string, amount: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + amount, 1);
  return monthKey(d);
};

export const getLastMonthKeys = (count: number, baseDate: Date = new Date()) => {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
};

export const getMonthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

export const txDueDay = (tx: FinanceTx) => {
  const fromDueDate = tx.due_date ? Number(String(tx.due_date).slice(8, 10)) : 0;
  const fromAccount = Number(tx.accounts?.due_day || 0);
  const resolved = fromDueDate || fromAccount || 31;
  return Math.max(1, Math.min(31, resolved));
};

export const isExpenseInDynamicCycle = (tx: FinanceTx, currentMonth: string, todayDay: number) => {
  const month = tx.transaction_date.slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay >= due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const carry = month < activeMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === activeMonth || carry;
};

export const isExpenseInDynamicPreviousCycle = (tx: FinanceTx, currentMonth: string, todayDay: number) => {
  const month = tx.transaction_date.slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay >= due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const previousActiveMonth = addMonthsToKey(activeMonth, -1);
  const carry = month < previousActiveMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === previousActiveMonth || carry;
};

const isPendingLikeExpense = (tx: FinanceTx) => tx.status === "pending" || tx.status === "overdue";

export const getActiveCycleMonth = (transactions: FinanceTx[], currentMonth: string, todayDay: number) => {
  const hasCreditCycleTurned = transactions.some((tx) => {
    if (tx.type !== "expense") return false;
    if (tx.payment_method !== "credit") return false;
    return todayDay >= txDueDay(tx);
  });

  return hasCreditCycleTurned ? addMonthsToKey(currentMonth, 1) : currentMonth;
};

export const startOfMonthString = (date: Date) => `${monthKey(date)}-01`;

export const getFinanceTransactionsWindowStart = (monthsBack: number) => {
  const now = new Date();
  return startOfMonthString(new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1));
};

const FINANCE_TRANSACTION_SELECT =
  "id, amount, type, status, source, notes, payment_method, transaction_date, due_date, account_id, category_id, categories(id, name, color, parent_id), accounts:accounts!transactions_account_id_fkey(id, name, type, due_day, current_balance)";

const removeDisconnectedCardTransactions = (transactions: FinanceTx[]) =>
  transactions.filter((tx) => !String(tx.notes || "").startsWith("mc_sync_installment:"));

type FinanceTransactionScope = {
  from?: string;
  before?: string;
  statuses?: FinanceTx["status"][];
};

const compareFinanceTransactions = (first: FinanceTx, second: FinanceTx) =>
  first.transaction_date.localeCompare(second.transaction_date) || first.id.localeCompare(second.id);

const fetchFinanceTransactionScope = async (
  userId: string,
  scope: FinanceTransactionScope,
) => {
  const pageSize = 500;
  const transactionsById = new Map<string, FinanceTx>();
  let cursor: Pick<FinanceTx, "id" | "transaction_date"> | null = null;

  while (true) {
    let query = supabase
      .from("transactions")
      .select(FINANCE_TRANSACTION_SELECT)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(pageSize);

    if (scope.from) query = query.gte("transaction_date", scope.from);
    if (scope.before) query = query.lt("transaction_date", scope.before);
    if (scope.statuses) query = query.in("status", scope.statuses);
    if (cursor) {
      query = query.or(
        `transaction_date.gt.${cursor.transaction_date},and(transaction_date.eq.${cursor.transaction_date},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) throw error;
    const page = (data || []) as FinanceTx[];
    if (page.length === 0) break;
    page.forEach((transaction) => transactionsById.set(transaction.id, transaction));
    const lastTransaction = page[page.length - 1];
    if (
      cursor &&
      cursor.id === lastTransaction.id &&
      cursor.transaction_date === lastTransaction.transaction_date
    ) break;
    cursor = {
      id: lastTransaction.id,
      transaction_date: lastTransaction.transaction_date,
    };
  }

  return [...transactionsById.values()].sort(compareFinanceTransactions);
};

export const fetchFinanceTransactions = async (userId: string, monthsBack = 12) => {
  const windowStart = getFinanceTransactionsWindowStart(monthsBack);
  const [currentWindow, olderPending] = await Promise.all([
    fetchFinanceTransactionScope(userId, { from: windowStart }),
    fetchFinanceTransactionScope(userId, {
      before: windowStart,
      statuses: ["pending", "overdue"],
    }),
  ]);
  const transactionsById = new Map<string, FinanceTx>();
  [...olderPending, ...currentWindow].forEach((transaction) => {
    transactionsById.set(transaction.id, transaction);
  });
  return removeDisconnectedCardTransactions(
    [...transactionsById.values()].sort(compareFinanceTransactions),
  );
};

export const fetchFinanceTransactionsByMonth = async (userId: string, refMonth: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(refMonth)) {
    throw new Error("Mês de referência inválido.");
  }

  const monthStart = `${refMonth}-01`;
  const nextMonthStart = `${addMonthsToKey(refMonth, 1)}-01`;
  const transactions = await fetchFinanceTransactionScope(userId, {
    from: monthStart,
    before: nextMonthStart,
  });
  return removeDisconnectedCardTransactions(transactions);
};

type FinanceDimensionFilters = {
  accountFilter?: string;
  paymentFilter?: string;
  statusFilter?: string;
  categoryFilter?: string;
  subcategoryFilter?: string;
  categories?: Array<{ id: string; parent_id: string | null }>;
};

export const applyFinanceDimensionFilters = (transactions: FinanceTx[], filters: FinanceDimensionFilters) => {
  const {
    accountFilter = "all",
    paymentFilter = "all",
    statusFilter = "all",
    categoryFilter = "all",
    subcategoryFilter = "all",
    categories = [],
  } = filters;

  return transactions.filter((tx) => {
    if (accountFilter !== "all" && tx.account_id !== accountFilter) return false;
    if (paymentFilter !== "all" && getPaymentKey(tx) !== paymentFilter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;

    if (categoryFilter !== "all" || subcategoryFilter !== "all") {
      if (!tx.category_id) return false;
      if (subcategoryFilter !== "all") return tx.category_id === subcategoryFilter;
      if (categoryFilter !== "all") {
        const childIds = categories.filter((cat) => cat.parent_id === categoryFilter).map((cat) => cat.id);
        return tx.category_id === categoryFilter || childIds.includes(tx.category_id);
      }
    }

    return true;
  });
};

export const getCycleScopedTransactions = (transactions: FinanceTx[], currentMonth: string, todayDay: number) => {
  const activeCycleMonth = getActiveCycleMonth(transactions, currentMonth, todayDay);
  return transactions.filter((tx) => {
    if (tx.type === "income") return tx.transaction_date.slice(0, 7) === currentMonth;
    if (tx.type !== "expense") return false;

    const txMonth = tx.transaction_date.slice(0, 7);
    if (txMonth === activeCycleMonth) return true;
    return txMonth < activeCycleMonth && isPendingLikeExpense(tx);
  });
};

export const getPreviousCycleScopedTransactions = (transactions: FinanceTx[], currentMonth: string, previousMonth: string, todayDay: number) => {
  const activeCycleMonth = getActiveCycleMonth(transactions, currentMonth, todayDay);
  const previousActiveCycleMonth = addMonthsToKey(activeCycleMonth, -1);
  return transactions.filter((tx) => {
    if (tx.type === "income") return tx.transaction_date.slice(0, 7) === previousMonth;
    if (tx.type !== "expense") return false;

    const txMonth = tx.transaction_date.slice(0, 7);
    if (txMonth === previousActiveCycleMonth) return true;
    return txMonth < previousActiveCycleMonth && isPendingLikeExpense(tx);
  });
};
