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
  return normalized === "cartao" || normalized === "cartoes";
};

export const isBankCategory = (label: string) => {
  const normalized = normalizeLabel(label);
  if (isGenericCardCategory(normalized)) return false;
  return Object.keys(BANK_COLORS).some((key) => normalized.includes(normalizeLabel(key)));
};

export const resolveBankCategoryColor = (label: string, fallback: string) => {
  const normalized = normalizeLabel(label);
  const direct = BANK_COLORS[normalized];
  if (direct) return direct;
  const byContains = Object.entries(BANK_COLORS).find(([key]) => normalized.includes(key));
  return byContains?.[1] || fallback;
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
  const activeMonth = todayDay > due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const carry = month < activeMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === activeMonth || carry;
};

export const isExpenseInDynamicPreviousCycle = (tx: FinanceTx, currentMonth: string, todayDay: number) => {
  const month = tx.transaction_date.slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay > due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const previousActiveMonth = addMonthsToKey(activeMonth, -1);
  const carry = month < previousActiveMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === previousActiveMonth || carry;
};

export const startOfMonthString = (date: Date) => `${monthKey(date)}-01`;

export const getFinanceTransactionsWindowStart = (monthsBack: number) => {
  const now = new Date();
  return startOfMonthString(new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1));
};

export const fetchFinanceTransactions = async (userId: string, monthsBack = 12) => {
  const windowStart = getFinanceTransactionsWindowStart(monthsBack);
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, amount, type, status, source, notes, payment_method, transaction_date, due_date, account_id, category_id, categories(id, name, color, parent_id), accounts:accounts!transactions_account_id_fkey(id, name, type, due_day, current_balance)",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`transaction_date.gte.${windowStart},and(transaction_date.lt.${windowStart},status.in.(pending,overdue))`)
    .order("transaction_date", { ascending: true });

  if (error) throw error;
  return (data || []) as FinanceTx[];
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

export const getCycleScopedTransactions = (transactions: FinanceTx[], currentMonth: string, todayDay: number) =>
  transactions.filter((tx) => {
    if (tx.type === "income") return tx.transaction_date.slice(0, 7) === currentMonth;
    if (tx.type !== "expense") return false;

    const isCreditExpense = tx.payment_method === "credit";
    if (!isCreditExpense) return tx.transaction_date.slice(0, 7) === currentMonth;

    return isExpenseInDynamicCycle(tx, currentMonth, todayDay);
  });

export const getPreviousCycleScopedTransactions = (transactions: FinanceTx[], currentMonth: string, previousMonth: string, todayDay: number) =>
  transactions.filter((tx) => {
    if (tx.type === "income") return tx.transaction_date.slice(0, 7) === previousMonth;
    if (tx.type !== "expense") return false;

    const isCreditExpense = tx.payment_method === "credit";
    if (!isCreditExpense) return tx.transaction_date.slice(0, 7) === previousMonth;

    return isExpenseInDynamicPreviousCycle(tx, currentMonth, todayDay);
  });
