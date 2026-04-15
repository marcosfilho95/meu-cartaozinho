
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { ensureDefaultGoals } from "@/lib/financeGoalDefaults";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Clock,
  LineChart as LineChartIcon,
  Loader2 as Loader2Icon,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { GoalsSection } from "@/components/finance/GoalsSection";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FinanceDashboardProps { userId: string; }
type MonthTrend = "up" | "down" | "stable";


type FinanceTx = {
  id: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  status: "pending" | "paid" | "overdue" | "canceled";
  transaction_date: string;
  due_date?: string | null;
  account_id: string;
  category_id: string | null;
  categories?: { id: string; name: string; color: string | null; parent_id: string | null } | null;
  accounts?: { id: string; name: string; type: string; due_day?: number | null } | null;
};

type DistributionItem = { key: string; label: string; value: number; color: string; percentage: number; };

const CATEGORY_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#F0B27A", "#BB8FCE", "#AEB6BF", "#82E0AA"];
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
const PAYMENT_LABELS: Record<string, string> = {
  credit_card: "Cartão de crédito", checking: "Conta corrente", savings: "Poupança", cash: "Dinheiro",
  investment: "Investimento", loan: "Empréstimo", transferencia: "Transferência", other: "Outro",
};
const PAYMENT_COLORS: Record<string, string> = {
  credit_card: "#7C3AED", checking: "#0284C7", savings: "#0891B2", cash: "#D97706",
  investment: "#16A34A", loan: "#EF4444", transferencia: "#2563EB", other: "#6B7280",
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const addMonthsToKey = (key: string, amount: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + amount, 1);
  return monthKey(d);
};
const txDueDay = (tx: FinanceTx) => {
  const fromDueDate = tx.due_date ? Number(String(tx.due_date).slice(8, 10)) : 0;
  const fromAccount = Number(tx.accounts?.due_day || 0);
  const resolved = fromDueDate || fromAccount || 31;
  return Math.max(1, Math.min(31, resolved));
};

const isExpenseInDynamicCycle = (tx: FinanceTx, currentMonth: string, todayDay: number) => {
  const month = tx.transaction_date.slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay > due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  // Include: exact match, carry-forward from past, or next-month upcoming
  const nextMonth = addMonthsToKey(activeMonth, 1);
  const carry = month < activeMonth && (tx.status === "pending" || tx.status === "overdue");
  const upcoming = month === nextMonth;
  return month === activeMonth || carry || upcoming;
};

const isExpenseInDynamicPreviousCycle = (tx: FinanceTx, currentMonth: string, todayDay: number) => {
  const month = tx.transaction_date.slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay > due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const previousActiveMonth = addMonthsToKey(activeMonth, -1);
  const carry = month < previousActiveMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === previousActiveMonth || carry;
};
const startOfMonthString = (date: Date) => `${monthKey(date)}-01`;
const getLastMonthKeys = (count: number, baseDate: Date = new Date()) => {
  const base = baseDate;
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
};
const getMonthLabel = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
const trendFromDelta = (delta: number): MonthTrend => (delta > 0.001 ? "up" : delta < -0.001 ? "down" : "stable");
const buildDistribution = (items: { key: string; label: string; value: number; color: string }[]): DistributionItem[] => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];
  return items.map((item) => ({ ...item, percentage: (item.value / total) * 100 })).sort((a, b) => b.value - a.value);
};
const getPaymentKey = (tx: FinanceTx) => {
  if (tx.type === "transfer") return "transferencia";
  const accountType = tx.accounts?.type || "other";
  return PAYMENT_LABELS[accountType] ? accountType : "other";
};
const normalizeLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const resolveBankCategoryColor = (label: string, fallback: string) => {
  const normalized = normalizeLabel(label);
  const direct = BANK_COLORS[normalized];
  if (direct) return direct;
  const byContains = Object.entries(BANK_COLORS).find(([key]) => normalized.includes(key));
  return byContains?.[1] || fallback;
};

const isGenericCardCategory = (label: string) => {
  const normalized = normalizeLabel(label);
  return normalized === "cartao" || normalized === "cartoes";
};

const isBankCategory = (label: string) => {
  const normalized = normalizeLabel(label);
  if (isGenericCardCategory(normalized)) return false;
  return Object.keys(BANK_COLORS).some((key) => normalized.includes(normalizeLabel(key)));
};

const SegmentedDistributionBar: React.FC<{ title: string; items: DistributionItem[]; }> = ({ title, items }) => {
  const [active, setActive] = useState<string | null>(null);
  if (items.length === 0) {
    return <Card className="border-0 shadow-card"><CardContent className="p-4 text-sm text-muted-foreground">Sem dados para {title.toLowerCase()}.</CardContent></Card>;
  }
  const selected = items.find((item) => item.key === active) || items[0];
  return (
    <Card className="border-0 shadow-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-bold text-foreground">{title}</h3>
          <Badge variant="outline" className="text-[11px]">{selected.label}: {selected.percentage.toFixed(1)}%</Badge>
        </div>
        <div className="flex h-5 overflow-hidden rounded-full bg-muted">
          {items.map((item) => (
            <button key={item.key} type="button" title={`${item.label}: ${formatCurrency(item.value)} (${item.percentage.toFixed(1)}%)`}
              onMouseEnter={() => setActive(item.key)} onFocus={() => setActive(item.key)} onClick={() => setActive(item.key)}
              className={cn("h-full transition-opacity", active && active !== item.key ? "opacity-60" : "opacity-100")}
              style={{ width: `${Math.max(item.percentage, 2)}%`, backgroundColor: item.color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button key={item.key} type="button" onClick={() => setActive(item.key)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium", active === item.key ? "border-primary/45 bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
const DEFAULTS_INIT_KEY = "finance_defaults_initialized";

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"simple" | "advanced">("simple");
  const [showGoalsOnSimple, setShowGoalsOnSimple] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);

  const [periodMonths, setPeriodMonths] = useState<1 | 3 | 6 | 12>(6);
  const [chartRange, setChartRange] = useState<6 | 12>(6);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const currentMonth = monthKey(new Date());
  const previousMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const todayDay = new Date().getDate();

  const fetchData = React.useCallback(async () => {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [accountsRes, categoriesRes, goalsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("id, name, type, due_day, current_balance, is_active, include_in_net_worth").eq("user_id", userId).eq("is_active", true).order("name"),
      supabase.from("categories").select("id, name, color, kind, parent_id").eq("user_id", userId).order("name"),
      supabase.from("goals").select("id, name, target_amount, current_amount, is_completed").eq("user_id", userId).order("created_at"),
      supabase
        .from("transactions")
        .select("id, amount, type, status, transaction_date, due_date, account_id, category_id, categories(id, name, color, parent_id), accounts:accounts!transactions_account_id_fkey(id, name, type, due_day)")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("transaction_date", startOfMonthString(twelveMonthsAgo))
        .order("transaction_date", { ascending: true }),
    ]);

    if (accountsRes.error || categoriesRes.error || goalsRes.error || txRes.error) {
      toast.error("Falha ao carregar dashboard financeiro.");
      return;
    }

    setAccounts(accountsRes.data || []);
    setCategories(categoriesRes.data || []);
    setGoals(goalsRes.data || []);
    setTransactions((txRes.data as FinanceTx[]) || []);
  }, [userId]);

  const loadData = React.useCallback(async () => {
    setLoading(true);

    // Run default seeding only once per session
    const initKey = `${DEFAULTS_INIT_KEY}:${userId}`;
    if (!sessionStorage.getItem(initKey)) {
      try {
        await Promise.all([
          ensureDefaultAccounts(userId),
          ensureDefaultCategories(userId),
          ensureDefaultGoals(userId),
        ]);
      } catch {}
      sessionStorage.setItem(initKey, "1");
    }

    await fetchData();
    setLoading(false);
  }, [userId, fetchData]);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, loadData]);

  useEffect(() => {
    const onFinanceSync = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string }>;
      if (custom.detail?.userId && custom.detail.userId !== userId) return;
      fetchData(); // Fast reload: no default seeding
    };
    window.addEventListener("finance-sync-updated", onFinanceSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onFinanceSync as EventListener);
  }, [fetchData, userId]);

  const hasBankExpenseCategories = useMemo(
    () => categories.some((category: any) => category.kind === "expense" && isBankCategory(String(category.name || ""))),
    [categories],
  );

  const parentCategories = useMemo(
    () => categories.filter((category: any) => category.kind === "expense" && !category.parent_id),
    [categories],
  );
  const subcategories = useMemo(
    () =>
      categoryFilter === "all"
        ? []
        : categories.filter((category: any) => {
            if (category.parent_id !== categoryFilter) return false;
            if (!hasBankExpenseCategories) return true;
            return !isGenericCardCategory(String(category.name || ""));
          }),
    [categories, categoryFilter, hasBankExpenseCategories],
  );

  useEffect(() => {
    if (categoryFilter === "all") { setSubcategoryFilter("all"); return; }
    if (subcategoryFilter === "all") return;
    if (!subcategories.some((item: any) => item.id === subcategoryFilter)) setSubcategoryFilter("all");
  }, [categoryFilter, subcategories, subcategoryFilter]);

  const categoryMatch = (tx: FinanceTx) => {
    if (categoryFilter === "all" && subcategoryFilter === "all") return true;
    if (!tx.category_id) return false;
    if (subcategoryFilter !== "all") return tx.category_id === subcategoryFilter;
    if (categoryFilter === "all") return true;
    const childIds = categories.filter((cat: any) => cat.parent_id === categoryFilter).map((cat: any) => cat.id);
    return tx.category_id === categoryFilter || childIds.includes(tx.category_id);
  };

  const dimensionalFilteredTx = useMemo(() => transactions.filter((tx) => {
    if (accountFilter !== "all" && tx.account_id !== accountFilter) return false;
    if (paymentFilter !== "all" && getPaymentKey(tx) !== paymentFilter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (!categoryMatch(tx)) return false;
    return true;
  }), [transactions, accountFilter, paymentFilter, statusFilter, categoryFilter, subcategoryFilter, categories]);

  const periodKeys = useMemo(() => getLastMonthKeys(periodMonths), [periodMonths]);
  const periodFilteredTx = useMemo(() => {
    const keySet = new Set(periodKeys);
    return dimensionalFilteredTx.filter((tx) => keySet.has(tx.transaction_date.slice(0, 7)));
  }, [dimensionalFilteredTx, periodKeys]);

  const currentMonthTx = useMemo(() => {
    return dimensionalFilteredTx.filter((tx) => {
      if (tx.type === "income") return tx.transaction_date.slice(0, 7) === currentMonth;
      return isExpenseInDynamicCycle(tx, currentMonth, todayDay);
    });
  }, [dimensionalFilteredTx, currentMonth, todayDay]);

  const previousMonthTx = useMemo(() => {
    return dimensionalFilteredTx.filter((tx) => {
      if (tx.type === "income") return tx.transaction_date.slice(0, 7) === previousMonth;
      return isExpenseInDynamicPreviousCycle(tx, currentMonth, todayDay);
    });
  }, [dimensionalFilteredTx, previousMonth, currentMonth, todayDay]);

  const currentIncome = useMemo(() => currentMonthTx.filter((tx) => tx.type === "income" && tx.status !== "canceled").reduce((sum, tx) => sum + Number(tx.amount), 0), [currentMonthTx]);
  const currentExpense = useMemo(() => currentMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").reduce((sum, tx) => sum + Number(tx.amount), 0), [currentMonthTx]);
  const paidExpense = useMemo(() => currentMonthTx.filter((tx) => tx.type === "expense" && tx.status === "paid").reduce((sum, tx) => sum + Number(tx.amount), 0), [currentMonthTx]);
  const pendingExpense = useMemo(() => currentMonthTx.filter((tx) => tx.type === "expense" && (tx.status === "pending" || tx.status === "overdue")).reduce((sum, tx) => sum + Number(tx.amount), 0), [currentMonthTx]);
  const previousIncome = useMemo(() => previousMonthTx.filter((tx) => tx.type === "income" && tx.status !== "canceled").reduce((sum, tx) => sum + Number(tx.amount), 0), [previousMonthTx]);
  const previousExpense = useMemo(() => previousMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").reduce((sum, tx) => sum + Number(tx.amount), 0), [previousMonthTx]);

  const monthBalance = currentIncome - currentExpense;
  const previousBalance = previousIncome - previousExpense;
  const balanceDelta = monthBalance - previousBalance;
  const trendLabel = (current: number, previous: number) => {
    const delta = current - previous;
    const trend = trendFromDelta(delta);
    if (trend === "stable") return "Estável";
    return `${trend === "up" ? "Subiu" : "Caiu"} ${formatCurrency(Math.abs(delta))}`;
  };

  const evolutionBaseDate = useMemo(() => {
    const maxMonth = dimensionalFilteredTx
      .filter((tx) => tx.type === "expense" && tx.status !== "canceled")
      .reduce((max, tx) => {
        const key = tx.transaction_date.slice(0, 7);
        return key > max ? key : max;
      }, currentMonth);

    if (maxMonth <= currentMonth) return new Date();
    const [y, m] = maxMonth.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }, [dimensionalFilteredTx, currentMonth]);

  const evolutionKeys = useMemo(() => getLastMonthKeys(chartRange, evolutionBaseDate), [chartRange, evolutionBaseDate]);
  const evolutionData = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    evolutionKeys.forEach((key) => { map[key] = { income: 0, expense: 0 }; });
    dimensionalFilteredTx.forEach((tx) => {
      const key = tx.transaction_date.slice(0, 7);
      if (!map[key] || tx.status === "canceled") return;
      if (tx.type === "income") map[key].income += Number(tx.amount);
      if (tx.type === "expense") map[key].expense += Number(tx.amount);
    });
    return evolutionKeys.map((key) => ({ key, month: getMonthLabel(key), receitas: map[key].income, despesas: map[key].expense, saldo: map[key].income - map[key].expense }));
  }, [dimensionalFilteredTx, evolutionKeys]);
  const expenseTxCurrent = useMemo(() => currentMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled"), [currentMonthTx]);
  const expenseTxCurrentForVisual = useMemo(() => expenseTxCurrent, [expenseTxCurrent]);

  // Build a stable color map: category_id -> resolved color (same everywhere)
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((cat: any) => {
      const label = String(cat.name || "");
      const baseColor = cat.color || "#AEB6BF";
      map[cat.id] = resolveBankCategoryColor(label, baseColor);
    });
    map["uncategorized"] = "#AEB6BF";
    return map;
  }, [categories]);

  const categoryDistribution = useMemo(() => {
    const grouped: Record<string, { label: string; value: number; color: string }> = {};
    expenseTxCurrentForVisual.forEach((tx) => {
      const id = tx.category_id || "uncategorized";
      const label = tx.categories?.name || "Sem categoria";
      const color = categoryColorMap[id] || "#AEB6BF";
      if (!grouped[id]) grouped[id] = { label, value: 0, color };
      grouped[id].value += Number(tx.amount);
    });
    return buildDistribution(Object.entries(grouped).map(([key, data]) => ({ key, ...data })));
  }, [expenseTxCurrentForVisual, categoryColorMap]);

  const paymentDistribution = useMemo(() => {
    const grouped: Record<string, { label: string; value: number; color: string }> = {};
    expenseTxCurrentForVisual.forEach((tx) => {
      const key = getPaymentKey(tx);
      const label = PAYMENT_LABELS[key] || PAYMENT_LABELS.other;
      const color = PAYMENT_COLORS[key] || PAYMENT_COLORS.other;
      if (!grouped[key]) grouped[key] = { label, value: 0, color };
      grouped[key].value += Number(tx.amount);
    });
    return buildDistribution(Object.entries(grouped).map(([key, data]) => ({ key, ...data })));
  }, [expenseTxCurrentForVisual]);

  const categoryRows = useMemo(() => {
    const currentMap: Record<string, number> = {};
    const previousMap: Record<string, number> = {};

    currentMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").forEach((tx) => {
      const id = tx.category_id || "uncategorized";
      currentMap[id] = (currentMap[id] || 0) + Number(tx.amount);
    });
    previousMonthTx.filter((tx) => tx.type === "expense" && tx.status !== "canceled").forEach((tx) => {
      const id = tx.category_id || "uncategorized";
      previousMap[id] = (previousMap[id] || 0) + Number(tx.amount);
    });

    const currentTotal = Object.values(currentMap).reduce((sum, value) => sum + value, 0);
    return Object.entries(currentMap).map(([id, currentValue]) => {
      const category = categories.find((item: any) => item.id === id);
      const previousValue = previousMap[id] || 0;
      const delta = currentValue - previousValue;
      const label = category?.name || "Sem categoria";
      return {
        id,
        label,
        color: categoryColorMap[id] || "#AEB6BF",
        currentValue,
        percentage: currentTotal > 0 ? (currentValue / currentTotal) * 100 : 0,
        delta,
        trend: trendFromDelta(delta),
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [currentMonthTx, previousMonthTx, categories, categoryColorMap]);

  const totalNetWorth = useMemo(() => accounts.reduce((sum, account) => sum + (account.include_in_net_worth ? Number(account.current_balance) : 0), 0), [accounts]);
  const paymentOptions = useMemo(() => Array.from(new Set(transactions.map((tx) => getPaymentKey(tx)))), [transactions]);

  const topExpenseCategories = useMemo(() => {
    const byCategory: Record<string, { label: string; color: string; total: number }> = {};
    dimensionalFilteredTx.forEach((tx) => {
      const key = tx.transaction_date.slice(0, 7);
      if (!evolutionKeys.includes(key)) return;
      if (tx.type !== "expense" || tx.status === "canceled") return;
      const id = tx.category_id || "uncategorized";
      const label = tx.categories?.name || "Sem categoria";
      const color = categoryColorMap[id] || "#AEB6BF";
      if (!byCategory[id]) byCategory[id] = { label, color, total: 0 };
      byCategory[id].total += Number(tx.amount);
    });

    return Object.entries(byCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 4)
      .map(([id, meta]) => ({ id, ...meta }));
  }, [dimensionalFilteredTx, evolutionKeys, categoryColorMap]);

  const stackedExpenseData = useMemo(() => {
    const byMonth: Record<string, any> = {};

    evolutionKeys.forEach((key) => {
      byMonth[key] = {
        month: getMonthLabel(key),
        totalDespesas: 0,
      };
      topExpenseCategories.forEach((cat) => {
        byMonth[key][`cat_${cat.id}`] = 0;
      });
    });

    dimensionalFilteredTx.forEach((tx) => {
      const key = tx.transaction_date.slice(0, 7);
      if (!byMonth[key]) return;
      if (tx.type !== "expense" || tx.status === "canceled") return;

      byMonth[key].totalDespesas += Number(tx.amount);
      const catId = tx.category_id || "uncategorized";
      const slot = topExpenseCategories.find((cat) => cat.id === catId);
      if (slot) byMonth[key][`cat_${slot.id}`] += Number(tx.amount);
    });

    return evolutionKeys.map((key) => byMonth[key]);
  }, [dimensionalFilteredTx, evolutionKeys, topExpenseCategories]);

  // Pending + recent transactions for dashboard
  const pendingTx = useMemo(() => currentMonthTx.filter((tx) => tx.status === "pending" || tx.status === "overdue").sort((a, b) => a.transaction_date.localeCompare(b.transaction_date)), [currentMonthTx]);
  const recentTx = useMemo(() => [...currentMonthTx].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, 8), [currentMonthTx]);
  const [bulkPaying, setBulkPaying] = useState(false);

  const handleBulkPayAll = async () => {
    if (pendingTx.length === 0) return;
    setBulkPaying(true);
    try {
      const ids = pendingTx.map((tx) => tx.id);
      const { error } = await supabase.from("transactions").update({ status: "paid" as const }).in("id", ids);
      if (error) throw error;
      toast.success(`✅ ${ids.length} contas confirmadas!`);
      await fetchData();
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha"));
    } finally {
      setBulkPaying(false);
    }
  };

  const handleToggleStatus = async (tx: FinanceTx) => {
    const newStatus = tx.status === "paid" ? "pending" : "paid";
    setTogglingId(tx.id);
    try {
      const { error } = await supabase.from("transactions").update({ status: newStatus }).eq("id", tx.id);
      if (error) throw error;
      toast.success(newStatus === "paid" ? "✅ Confirmado!" : "Voltou para pendente");
      await fetchData();
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha"));
    } finally {
      setTogglingId(null);
    }
  };

  const isSimple = viewMode === "simple";

  if (loading && transactions.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 animate-pulse">
        <div className="rounded-2xl bg-card/80 border border-border/30 p-4 space-y-3">
          <div className="h-5 w-32 rounded-lg bg-muted" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-9 rounded-xl bg-muted" />)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 rounded-2xl bg-card border border-border/30" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="h-72 rounded-2xl bg-card border border-border/30" />
          <div className="h-72 rounded-2xl bg-card border border-border/30" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <Card className="border-0 shadow-elevated">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">Modo</Badge>
                <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("simple")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition", isSimple ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Simples
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("advanced")}
                    className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition", !isSimple ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Completo
                  </button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{isSimple ? "Visão direta para uso rápido" : "Visão detalhada com análise completa"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">Filtros</Badge>
              <span className="text-xs text-muted-foreground">{periodFilteredTx.length} transações no período</span>
              <span className="text-xs text-muted-foreground">
                Ciclo de fatura por cartão: <span className="font-semibold text-foreground">dinâmico</span>
              </span>
              {loading && <span className="text-xs text-muted-foreground">Atualizando...</span>}
            </div>
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", isSimple ? "xl:grid-cols-3" : "xl:grid-cols-6")}>
              <div>
                <Label className="text-[11px] text-muted-foreground">Período</Label>
                <Select value={String(periodMonths)} onValueChange={(value) => setPeriodMonths(Number(value) as 1 | 3 | 6 | 12)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 mês</SelectItem><SelectItem value="3">3 meses</SelectItem><SelectItem value="6">6 meses</SelectItem><SelectItem value="12">12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Conta</Label>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas</SelectItem>{accounts.map((account) => (<SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              {!isSimple && (
                <>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Categoria</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{parentCategories.map((category: any) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Subcategoria</Label>
                    <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{subcategories.map((category: any) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Forma de pagamento</Label>
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todas</SelectItem>{paymentOptions.map((option) => (<SelectItem key={option} value={option}>{PAYMENT_LABELS[option] || option}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="overdue">Atrasado</SelectItem></SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-0 shadow-card xl:col-span-2"><CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Saldo do mês</p>
            <p className={cn("mt-1 font-heading text-3xl font-extrabold", monthBalance >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(monthBalance)}</p>
            <p className="text-xs text-muted-foreground">Receitas - despesas</p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1 text-xs">
              {balanceDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              <span className="font-semibold">Vs mês anterior: {trendLabel(monthBalance, previousBalance)}</span>
            </div>
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4 text-center"><ArrowUpCircle className="mx-auto h-4.5 w-4.5 text-success" /><p className="mt-1 text-[11px] text-muted-foreground">Receitas</p><p className="text-lg font-bold text-success">{formatCurrency(currentIncome)}</p></CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-4 text-center"><ArrowDownCircle className="mx-auto h-4.5 w-4.5 text-destructive" /><p className="mt-1 text-[11px] text-muted-foreground">Despesas</p><p className="text-lg font-bold text-destructive">{formatCurrency(currentExpense)}</p></CardContent></Card>
          <Card className="border-0 shadow-card border-l-2 border-l-success"><CardContent className="p-4 text-center"><p className="text-[11px] text-muted-foreground">Pago</p><p className="text-lg font-bold text-success">{formatCurrency(paidExpense)}</p></CardContent></Card>
          <Card className="border-0 shadow-card border-l-2 border-l-warning"><CardContent className="p-4 text-center"><p className="text-[11px] text-muted-foreground">Pendente</p><p className="text-lg font-bold text-warning">{formatCurrency(pendingExpense)}</p></CardContent></Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold">Evolução de receitas e despesas</h2>
              <div className="flex gap-1 rounded-lg border border-border p-1">
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(6)}>6M</button>
                <button type="button" className={cn("rounded-md px-2 py-1 text-xs font-semibold", chartRange === 12 ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => setChartRange(12)}>12M</button>
              </div>
            </div>
            <div className="h-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={evolutionData}>
              <defs>
                <linearGradient id="incomeGradDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(152, 55%, 48%)" stopOpacity={0} /></linearGradient>
                <linearGradient id="expenseGradDashboard" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.28} /><stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Saldo"]}
                contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
              />
              <Area type="monotone" dataKey="receitas" stroke="hsl(152, 55%, 48%)" fill="url(#incomeGradDashboard)" strokeWidth={2} />
              <Area type="monotone" dataKey="despesas" stroke="hsl(0, 72%, 55%)" fill="url(#expenseGradDashboard)" strokeWidth={2} />
              <Line type="monotone" dataKey="saldo" stroke="#1E40AF" strokeWidth={2.2} dot={false} strokeDasharray="4 4" />
            </AreaChart></ResponsiveContainer></div>
          </CardContent></Card>

          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-primary" /><h2 className="font-heading text-sm font-bold">Categorias do mês</h2></div>
            {categoryDistribution.length === 0 ? (<p className="text-sm text-muted-foreground">Sem despesas no mês para exibir.</p>) : (
              <div className="flex items-center gap-4">
                <div className="h-52 w-52 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="78%" paddingAngle={2}>{categoryDistribution.map((item) => (<Cell key={item.key} fill={item.color} />))}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} /></PieChart></ResponsiveContainer></div>
                <div className="flex-1 space-y-1.5">{categoryDistribution.slice(0, 8).map((item) => (<div key={item.key} className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5 text-xs"><div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="font-medium">{item.label}</span></div><span className="font-semibold">{item.percentage.toFixed(1)}%</span></div>))}</div>
              </div>
            )}
          </CardContent></Card>
        </section>
        <section className="space-y-4">
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <h2 className="font-heading text-sm font-bold">Histórico de despesas</h2>
              {topExpenseCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem despesas para montar o gráfico por categoria.</p>
              ) : (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1 h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stackedExpenseData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                          <Tooltip
                            formatter={(value: number, name: string) => {
                              const found = topExpenseCategories.find((cat) => `cat_${cat.id}` === name);
                              if (found) return [formatCurrency(value), found.label];
                              return [formatCurrency(value), "Total despesas"];
                            }}
                            contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                          />
                          {topExpenseCategories.map((cat) => (
                            <Bar key={cat.id} dataKey={`cat_${cat.id}`} stackId="expense" fill={cat.color} radius={[2, 2, 0, 0]} />
                          ))}
                          <Line type="monotone" dataKey="totalDespesas" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="shrink-0 flex flex-col justify-center gap-2 min-w-[140px]">
                      {topExpenseCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2 text-xs">
                          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-medium">{cat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
                    <span className="inline-block h-[3px] w-5 rounded-full bg-[#111827]" />
                    <span className="font-medium">Total despesas</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {!isSimple && (
            <SegmentedDistributionBar title="Distribuição por forma de pagamento" items={paymentDistribution} />
          )}
        </section>

        {/* Pending bills */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                <h2 className="font-heading text-sm font-bold">Contas pendentes</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">{pendingTx.length}</Badge>
              </div>
              {pendingTx.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkPaying}
                  onClick={handleBulkPayAll}
                  className="h-8 gap-1.5 rounded-xl border-success/40 text-xs font-semibold text-success hover:bg-success/10 hover:text-success w-full"
                >
                  {bulkPaying ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Confirmar tudo ({formatCurrency(pendingTx.reduce((s, tx) => s + Number(tx.amount), 0))})
                </Button>
              )}
              {pendingTx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Tudo pago neste mês.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {pendingTx.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                      <button
                        type="button"
                        disabled={togglingId === tx.id}
                        onClick={() => handleToggleStatus(tx)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground hover:border-success hover:text-success transition-all"
                        title="Marcar como pago"
                      >
                        {togglingId === tx.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : null}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{(tx as any).source || (tx as any).notes || "Sem descrição"}</p>
                        <p className="text-[10px] text-muted-foreground">{tx.categories?.name || ""} · {new Date(tx.transaction_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
                      </div>
                      <p className={cn("text-sm font-bold shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
                        {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent transactions */}
          <Card className="border-0 shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-sm font-bold">Últimas transações</h2>
                </div>
                <button onClick={() => navigate("/financas/transacoes")} className="text-xs font-semibold text-primary hover:underline">Ver todas</button>
              </div>
              {recentTx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhuma transação no mês.</p>
              ) : (
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {recentTx.map((tx) => {
                    const isPaid = tx.status === "paid";
                    return (
                      <div key={tx.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                        <button
                          type="button"
                          disabled={togglingId === tx.id}
                          onClick={() => handleToggleStatus(tx)}
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                            isPaid ? "border-success bg-success/15 text-success" : "border-muted-foreground/30 text-muted-foreground hover:border-success hover:text-success"
                          )}
                          title={isPaid ? "Voltar para pendente" : "Marcar como pago"}
                        >
                          {togglingId === tx.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : isPaid ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tx.type === "income" ? "bg-success/10" : "bg-destructive/10")}>
                          {tx.type === "income" ? <ArrowUpCircle className="h-3.5 w-3.5 text-success" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", isPaid && "line-through text-muted-foreground")}>{(tx as any).source || (tx as any).notes || "Sem descrição"}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.categories?.name || ""}</p>
                        </div>
                        <p className={cn("text-sm font-bold shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
                          {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

      {!isSimple && (
        <section>
          <Card className="border-0 shadow-card"><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2"><LineChartIcon className="h-4 w-4 text-primary" /><h2 className="font-heading text-sm font-bold">Tabela analítica por categoria</h2></div>
            {categoryRows.length === 0 ? (<p className="text-sm text-muted-foreground">Sem despesas no mês para compor a tabela.</p>) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-2 font-semibold">Categoria</th><th className="py-2 text-right font-semibold">Valor</th><th className="py-2 text-right font-semibold">%</th><th className="py-2 text-right font-semibold">Variação</th><th className="py-2 text-right font-semibold">Tendência</th></tr></thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                        <td className="py-2.5"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-medium">{row.label}</span></div></td>
                        <td className="py-2.5 text-right font-semibold">{formatCurrency(row.currentValue)}</td>
                        <td className="py-2.5 text-right">{row.percentage.toFixed(1)}%</td>
                        <td className={cn("py-2.5 text-right font-semibold", row.delta > 0 ? "text-destructive" : row.delta < 0 ? "text-success" : "text-muted-foreground")}>{row.delta >= 0 ? "+" : ""}{formatCurrency(row.delta)}</td>
                        <td className="py-2.5 text-right">{row.trend === "up" && <span className="font-semibold text-destructive">Subiu</span>}{row.trend === "down" && <span className="font-semibold text-success">Caiu</span>}{row.trend === "stable" && <span className="font-semibold text-muted-foreground">Estável</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </section>
      )}

        {isSimple ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h2 className="font-heading text-sm font-bold">Metas e reservas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {showGoalsOnSimple ? "Modo completo de metas aberto abaixo." : "Toque para abrir quando quiser reservar ou retirar valores."}
              </p>
              <button
                type="button"
                onClick={() => setShowGoalsOnSimple((prev) => !prev)}
                className="gradient-primary mt-3 inline-flex h-10 items-center rounded-xl border border-primary/30 px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
              >
                {showGoalsOnSimple ? "Ocultar metas" : "Abrir metas e reservas"}
              </button>
            </div>
            {showGoalsOnSimple && (
              <GoalsSection
                userId={userId}
                goals={goals}
                accounts={accounts}
                totalBalance={totalNetWorth}
                monthBalance={monthBalance}
                onReload={loadData}
              />
            )}
          </section>
        ) : (
          <GoalsSection
            userId={userId}
            goals={goals}
            accounts={accounts}
            totalBalance={totalNetWorth}
            monthBalance={monthBalance}
            onReload={loadData}
          />
        )}

      </div>
    </>
  );
};

export default FinanceDashboard;
