import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchFinanceTransactionsByMonth,
  isBankCategory,
  isGenericCardCategory,
} from "@/lib/financeShared";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";
import {
  buildFinancialPlan,
  createFinancialRuleVersion,
  fetchFinancialRuleVersions,
  type FinancialRuleVersion,
} from "@/lib/financialRules";
import {
  getBudgetCoverage,
  getCategoryCoverage,
  getCategoryDepth,
  getCategorySpent,
  getMonthlySpendingGoal,
  hasBudgetHierarchyConflict,
  parseBudgetAmount,
} from "@/lib/financeBudget";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PieChart,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface BudgetPageProps {
  userId: string;
}

type BudgetRow = {
  id: string;
  category_id: string | null;
  limit_amount: number;
  alert_threshold_pct: number;
  ref_month: string;
  created_at: string;
};

type Category = {
  id: string;
  name: string;
  color: string | null;
  kind: string;
  icon: string | null;
  parent_id: string | null;
};

type StatusColor = "success" | "warning" | "danger";

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (key: string) => {
  const d = new Date(`${key}-15T12:00:00`);
  const month = d.toLocaleDateString("pt-BR", { month: "long" });
  const year = d.getFullYear();
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
};

const getStatusColor = (pct: number, warningThreshold = 80): StatusColor => {
  if (pct >= 100) return "danger";
  if (pct >= warningThreshold) return "warning";
  return "success";
};

const statusStyles: Record<StatusColor, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const barBg: Record<StatusColor, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

const BudgetPage: React.FC<BudgetPageProps> = ({ userId }) => {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const refMonth = getMonthKey(currentDate);
  const refMonthRef = useRef(refMonth);
  refMonthRef.current = refMonth;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const loadRequestIdRef = useRef(0);

  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [financialRules, setFinancialRules] = useState<FinancialRuleVersion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Record<string, number>>({});
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [globalGoalInput, setGlobalGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isMutating = savingGoal || saving || deletingId !== null;

  const navigateMonth = (dir: -1 | 1) => {
    if (isMutating) return;
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
  };

  const loadData = useCallback(async () => {
    const requestedMonth = refMonth;
    const requestedUserId = userId;
    if (requestedMonth !== refMonthRef.current || requestedUserId !== userIdRef.current) return;
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      try {
        await ensureDefaultCategories(userId);
      } catch {
        // The budget can still load if category bootstrap is temporarily unavailable.
      }

      const [budgetsRes, catsRes, txsAll, loadedRules] = await Promise.all([
        supabase
          .from("budgets")
          .select("id, category_id, limit_amount, alert_threshold_pct, ref_month, created_at")
          .eq("user_id", userId)
          .eq("ref_month", refMonth)
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("id, name, color, kind, icon, parent_id")
          .eq("user_id", userId)
          .order("name"),
        fetchFinanceTransactionsByMonth(userId, refMonth),
        fetchFinancialRuleVersions(userId, refMonth),
      ]);

      if (budgetsRes.error) throw budgetsRes.error;
      if (catsRes.error) throw catsRes.error;
      if (
        requestId !== loadRequestIdRef.current ||
        requestedMonth !== refMonthRef.current ||
        requestedUserId !== userIdRef.current
      ) return;

      const loadedBudgets = (budgetsRes.data as BudgetRow[]) || [];
      setBudgets(loadedBudgets);
      setFinancialRules(loadedRules);
      const loadedMainGoal = loadedRules.find((rule) => rule.rule_key === "spending_limit");
      setGlobalGoalInput(
        loadedMainGoal
          ? Number(loadedMainGoal.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "",
      );
      setCategories((catsRes.data as Category[]) || []);

      const expMap: Record<string, number> = {};
      let income = 0;
      txsAll.forEach((tx) => {
        if (tx.status === "canceled" || !shouldIncludeInRealizedCalculations(tx)) return;
        if (tx.type === "income") {
          income += Number(tx.amount);
          return;
        }
        if (tx.type !== "expense") return;
        const catId = tx.category_id || "uncategorized";
        expMap[catId] = (expMap[catId] || 0) + Number(tx.amount);
      });
      setExpenses(expMap);
      setIncomeTotal(income);
    } catch (error: any) {
      if (
        requestId === loadRequestIdRef.current &&
        requestedMonth === refMonthRef.current &&
        requestedUserId === userIdRef.current
      ) {
        const message = error?.message || "Falha ao carregar o orçamento.";
        setBudgets([]);
        setExpenses({});
        setIncomeTotal(0);
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (
        requestId === loadRequestIdRef.current &&
        requestedMonth === refMonthRef.current &&
        requestedUserId === userIdRef.current
      ) setLoading(false);
    }
  }, [userId, refMonth]);

  useEffect(() => {
    loadData();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    const onFinanceSync = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string }>;
      if (custom.detail?.userId && custom.detail.userId !== userId) return;
      loadData();
    };
    window.addEventListener("finance-sync-updated", onFinanceSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onFinanceSync as EventListener);
  }, [loadData, userId]);

  const positiveBudgets = useMemo(() => {
    const seenCategories = new Set<string>();
    return budgets.filter((budget) => {
      if (!budget.category_id || Number(budget.limit_amount) <= 0 || seenCategories.has(budget.category_id)) return false;
      seenCategories.add(budget.category_id);
      return true;
    });
  }, [budgets]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const activeBudgets = useMemo(
    () => {
      const selectedCategoryIds: string[] = [];
      return positiveBudgets
        .filter((budget) => {
          const category = budget.category_id ? categoryById.get(budget.category_id) : undefined;
          return !category || (!isBankCategory(category.name) && !isGenericCardCategory(category.name));
        })
        .sort((first, second) =>
          getCategoryDepth(second.category_id || "", categories) -
          getCategoryDepth(first.category_id || "", categories),
        )
        .filter((budget) => {
          if (!budget.category_id) return true;
          if (hasBudgetHierarchyConflict(budget.category_id, selectedCategoryIds, categories)) return false;
          selectedCategoryIds.push(budget.category_id);
          return true;
        });
    },
    [categories, categoryById, positiveBudgets],
  );

  const legacyPaymentBudgets = useMemo(
    () => positiveBudgets.filter((budget) => {
      const category = budget.category_id ? categoryById.get(budget.category_id) : undefined;
      return Boolean(category && (isBankCategory(category.name) || isGenericCardCategory(category.name)));
    }),
    [categoryById, positiveBudgets],
  );

  const activeBudgetCategoryIds = useMemo(
    () => activeBudgets.flatMap((budget) => (budget.category_id ? [budget.category_id] : [])),
    [activeBudgets],
  );

  const protectedBudgetCategoryIds = useMemo(
    () => positiveBudgets.flatMap((budget) => (budget.category_id ? [budget.category_id] : [])),
    [positiveBudgets],
  );

  const budgetableCategories = useMemo(
    () => categories.filter(
      (category) =>
        category.kind === "expense" &&
        !isBankCategory(category.name) &&
        !isGenericCardCategory(category.name),
    ),
    [categories],
  );

  // Parent budgets include their descendants. New overlapping parent/child budgets are blocked below.
  const enrichedBudgets = useMemo(() => {
    return activeBudgets
      .map((budget) => {
        const cat = budget.category_id ? categoryById.get(budget.category_id) : undefined;
        const spent = budget.category_id ? getCategorySpent(budget.category_id, expenses, categories) : 0;
        const pct = (spent / Number(budget.limit_amount)) * 100;
        const remaining = Number(budget.limit_amount) - spent;
        const rawThreshold = Number(budget.alert_threshold_pct);
        const warningThreshold = Number.isFinite(rawThreshold)
          ? Math.max(0, Math.min(100, rawThreshold))
          : 80;
        const status = getStatusColor(pct, warningThreshold);
        const includesSubcategories = budget.category_id
          ? getCategoryCoverage(budget.category_id, categories).size > 1
          : false;
        return { ...budget, cat, spent, pct, remaining, status, includesSubcategories };
      })
      .sort((a, b) => b.pct - a.pct || String(a.cat?.name || "").localeCompare(String(b.cat?.name || ""), "pt-BR"));
  }, [activeBudgets, categories, categoryById, expenses]);

  // Summary
  const categoryTotalPlanned = useMemo(
    () => activeBudgets.reduce((sum, budget) => sum + Number(budget.limit_amount), 0),
    [activeBudgets],
  );
  const totalSpent = useMemo(
    () => Object.values(expenses).reduce((sum, amount) => sum + Number(amount), 0),
    [expenses],
  );
  const financialPlan = useMemo(
    () => buildFinancialPlan(financialRules, refMonth, incomeTotal, getMonthlySpendingGoal(budgets)),
    [budgets, financialRules, incomeTotal, refMonth],
  );
  const totalPlanned = financialPlan.spendingLimit;
  const hasVersionedSpendingRule = Boolean(financialPlan.spendingRule);
  const totalRemaining = totalPlanned - totalSpent;
  const overallPct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const projectedBalance = incomeTotal - totalPlanned;
  const realBalance = incomeTotal - totalSpent;

  const handleSaveGlobalGoal = async () => {
    const amount = parseBudgetAmount(globalGoalInput);
    if (!amount || amount <= 0) {
      toast.error("Informe quanto você quer gastar no máximo neste mês.");
      return;
    }

    setSavingGoal(true);
    try {
      await createFinancialRuleVersion({
        user_id: userId,
        rule_key: "spending_limit",
        rule_type: "spending_limit",
        effective_month: refMonth,
        value_type: "fixed",
        value: amount,
        calculation_base: "total_income",
        goal_id: null,
        priority: 0,
      });
      toast.success(hasVersionedSpendingRule ? `Nova versão válida a partir de ${getMonthLabel(refMonth)}.` : "Meta mensal criada!");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a meta mensal.");
    } finally {
      setSavingGoal(false);
    }
  };

  // Categories not yet budgeted
  const unbudgetedCategories = useMemo(
    () => budgetableCategories.filter(
      (category) => !hasBudgetHierarchyConflict(category.id, protectedBudgetCategoryIds, categories),
    ),
    [budgetableCategories, categories, protectedBudgetCategoryIds],
  );

  // Spending outside a budget remains visible, while legacy bank/card categories
  // get separate guidance because they represent the payment origin, not a purpose.
  const { unplannedExpenses, legacyPaymentExpenses } = useMemo(() => {
    const coveredIds = getBudgetCoverage(activeBudgetCategoryIds, categories);
    const uncovered = Object.entries(expenses)
      .filter(([catId]) => !coveredIds.has(catId))
      .map(([catId, amount]) => {
        const cat = categoryById.get(catId);
        return {
          catId,
          name: cat?.name || "Sem categoria",
          color: cat?.color || "#AEB6BF",
          amount,
          isLegacyPayment: Boolean(
            cat && (isBankCategory(cat.name) || isGenericCardCategory(cat.name)),
          ),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      unplannedExpenses: uncovered.filter((item) => !item.isLegacyPayment),
      legacyPaymentExpenses: uncovered.filter((item) => item.isLegacyPayment),
    };
  }, [activeBudgetCategoryIds, categories, categoryById, expenses]);

  const handleSave = async () => {
    const operationMonth = refMonth;
    const operationUserId = userId;
    const amount = parseBudgetAmount(formAmount);
    if (!amount || amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!editingBudget && !formCategoryId) {
      toast.error("Selecione uma categoria.");
      return;
    }
    if (
      !editingBudget &&
      hasBudgetHierarchyConflict(formCategoryId, protectedBudgetCategoryIds, categories)
    ) {
      toast.error("Essa categoria já está coberta por outro orçamento.");
      return;
    }

    setSaving(true);
    try {
      if (editingBudget) {
        const { error } = await supabase
          .from("budgets")
          .update({ limit_amount: amount })
          .eq("id", editingBudget.id)
          .eq("user_id", userId);
        if (error) throw error;
        toast.success("Orçamento atualizado!");
      } else {
        const existing = budgets.find(
          (budget) => budget.category_id === formCategoryId && Number(budget.limit_amount) > 0,
        );
        if (existing) {
          toast.error("Já existe orçamento para essa categoria neste mês.");
          return;
        }

        // Older versions created zero-value placeholders. Reuse one if it still exists.
        const placeholder = budgets.find(
          (budget) => budget.category_id === formCategoryId && Number(budget.limit_amount) <= 0,
        );
        const result = placeholder
          ? await supabase
              .from("budgets")
              .update({ limit_amount: amount })
              .eq("id", placeholder.id)
              .eq("user_id", userId)
          : await supabase.from("budgets").insert({
              user_id: userId,
              category_id: formCategoryId,
              ref_month: refMonth,
              limit_amount: amount,
            });
        const { error } = result;
        if (error) throw error;
        toast.success("Orçamento criado!");
      }
      setDialogOpen(false);
      setEditingBudget(null);
      setFormCategoryId("");
      setFormAmount("");
      if (operationMonth === refMonthRef.current && operationUserId === userIdRef.current) await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este orçamento?")) return;
    const operationMonth = refMonth;
    const operationUserId = userId;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      toast.success("Orçamento removido.");
      if (operationMonth === refMonthRef.current && operationUserId === userIdRef.current) await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erro");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (b: BudgetRow) => {
    setEditingBudget(b);
    setFormAmount(String(b.limit_amount));
    setFormCategoryId(b.category_id || "");
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingBudget(null);
    setFormAmount("");
    setFormCategoryId("");
    setDialogOpen(true);
  };

  // Copy budget from previous month
  const handleCopyPrevious = async () => {
    const targetMonth = refMonth;
    const operationUserId = userId;
    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevMonth = getMonthKey(prev);

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("budgets")
        .select("category_id, limit_amount, created_at")
        .eq("user_id", userId)
        .eq("ref_month", prevMonth)
        .gt("limit_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("Nenhum orçamento no mês anterior.");
        return;
      }

      const budgetableIds = new Set(budgetableCategories.map((category) => category.id));
      const sourceByCategory = new Map<string, number>();
      data.forEach((budget) => {
        if (!budget.category_id || !budgetableIds.has(budget.category_id)) return;
        if (!sourceByCategory.has(budget.category_id)) {
          sourceByCategory.set(budget.category_id, Number(budget.limit_amount));
        }
      });

      if (sourceByCategory.size === 0) {
        toast.info("O mês anterior não possui categorias elegíveis para orçamento.");
        return;
      }

      const sourceEntries = [...sourceByCategory.entries()].sort(([firstId], [secondId]) => {
        const depthDifference = getCategoryDepth(secondId, categories) - getCategoryDepth(firstId, categories);
        if (depthDifference !== 0) return depthDifference;
        return String(categoryById.get(firstId)?.name || "").localeCompare(
          String(categoryById.get(secondId)?.name || ""),
          "pt-BR",
        );
      });
      const categoriesToCopy: string[] = [];
      sourceEntries.forEach(([categoryId]) => {
        if (
          !hasBudgetHierarchyConflict(
            categoryId,
            [...protectedBudgetCategoryIds, ...categoriesToCopy],
            categories,
          )
        ) {
          categoriesToCopy.push(categoryId);
        }
      });

      const rows = categoriesToCopy.map((categoryId) => ({
        user_id: userId,
        category_id: categoryId,
        ref_month: targetMonth,
        limit_amount: sourceByCategory.get(categoryId)!,
      }));

      if (rows.length === 0) {
        toast.info("Todas as categorias elegíveis já estão cobertas neste mês.");
        return;
      }

      const { data: insertedRows, error: upsertError } = await supabase
        .from("budgets")
        .upsert(rows, {
          onConflict: "user_id,category_id,ref_month",
          ignoreDuplicates: true,
        })
        .select("id");
      if (upsertError) throw upsertError;
      const copiedCount = insertedRows?.length || 0;
      if (copiedCount === 0) {
        toast.info("Nenhum orçamento novo foi copiado; os limites atuais foram preservados.");
      } else {
        toast.success(`${copiedCount} orçamentos copiados do mês anterior!`);
      }
      if (targetMonth === refMonthRef.current && operationUserId === userIdRef.current) await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao copiar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24">
        <Card className="border-destructive/30">
          <CardContent className="space-y-3 py-10 text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-destructive" />
            <div>
              <p className="text-sm font-semibold">Não foi possível carregar o orçamento.</p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadData}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasPlannedBudget = totalPlanned > 0;
  const overallStatus: StatusColor = hasPlannedBudget
    ? getStatusColor(overallPct)
    : totalSpent > 0
      ? "danger"
      : "success";

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => navigateMonth(-1)}
          disabled={isMutating}
          className="rounded-xl border border-border p-2 hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h1 className="font-heading text-lg font-extrabold">{getMonthLabel(refMonth)}</h1>
          <p className="text-[11px] text-muted-foreground">Orçamento mensal</p>
        </div>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => navigateMonth(1)}
          disabled={isMutating}
          className="rounded-xl border border-border p-2 hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-card">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Target className="h-5 w-5" />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Meta mensal de gastos</p>
            </div>
            <h2 className="font-heading text-2xl font-extrabold">Quanto você quer gastar no máximo?</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Este é o limite de todas as suas despesas somadas. Ao alterar em {getMonthLabel(refMonth)},
              a nova regra vale deste mês em diante e não modifica meses anteriores.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R$</span>
                <Input
                  value={globalGoalInput}
                  onChange={(event) => setGlobalGoalInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSaveGlobalGoal();
                  }}
                  inputMode="decimal"
                  aria-label="Limite total de gastos do mês"
                  placeholder="Ex.: 7.000,00"
                  className="h-11 pl-10 text-base font-bold"
                  disabled={savingGoal}
                />
              </div>
              <Button className="h-11 px-6" onClick={handleSaveGlobalGoal} disabled={savingGoal}>
                {savingGoal ? <Loader2 className="h-4 w-4 animate-spin" /> : hasVersionedSpendingRule ? "Salvar nova versão" : "Criar meta"}
              </Button>
            </div>
            {!hasVersionedSpendingRule && categoryTotalPlanned > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Até você criar a meta total, o sistema continua usando a soma dos limites por categoria ({formatCurrency(categoryTotalPlanned)}).
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Você já gastou</p>
                <p className={cn("mt-1 font-heading text-2xl font-extrabold", statusStyles[overallStatus])}>{formatCurrency(totalSpent)}</p>
              </div>
              <Badge variant="outline" className={cn(statusStyles[overallStatus])}>
                {hasPlannedBudget ? `${overallPct.toFixed(0)}% da meta` : "Defina sua meta"}
              </Badge>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barBg[overallStatus])}
                style={{ width: `${hasPlannedBudget ? Math.min(overallPct, 100) : 0}%` }}
              />
            </div>
            <p className={cn("mt-3 text-sm font-semibold", totalRemaining >= 0 ? "text-success" : "text-destructive")}>
              {!hasPlannedBudget
                ? "Crie a meta para acompanhar seu progresso."
                : totalRemaining >= 0
                  ? `Você ainda pode gastar ${formatCurrency(totalRemaining)}.`
                  : `Você ultrapassou a meta em ${formatCurrency(Math.abs(totalRemaining))}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3.5 w-3.5 text-primary" />
               <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meta do mês</p>
            </div>
            <p className="font-heading text-xl font-extrabold text-foreground">{formatCurrency(totalPlanned)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3.5 w-3.5 text-destructive" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gasto real</p>
            </div>
            <p className={cn("font-heading text-xl font-extrabold", statusStyles[overallStatus])}>
              {formatCurrency(totalSpent)}
            </p>
            <p className="text-[10px] text-muted-foreground">
               {hasPlannedBudget ? `${overallPct.toFixed(0)}% da meta` : "Sem meta definida"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              {totalRemaining >= 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {totalRemaining >= 0 ? "Restante" : "Excesso"}
              </p>
            </div>
            <p className={cn("font-heading text-xl font-extrabold", totalRemaining >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(Math.abs(totalRemaining))}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <PieChart className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saldo projetado</p>
            </div>
            <p className={cn("font-heading text-lg font-extrabold", projectedBalance >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(projectedBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Real: <span className={cn("font-bold", realBalance >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(realBalance)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overall progress bar */}
      <Card className="border-0 shadow-card">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
             <h2 className="font-heading text-sm font-bold">Progresso da meta mensal</h2>
            <Badge
              className={cn(
                "text-[10px] font-bold",
                overallStatus === "success" && "bg-success/15 text-success border-success/30",
                overallStatus === "warning" && "bg-warning/15 text-warning border-warning/30",
                overallStatus === "danger" && "bg-destructive/15 text-destructive border-destructive/30",
              )}
            >
              {hasPlannedBudget ? `${overallPct.toFixed(0)}%` : "Sem limite"}
            </Badge>
          </div>
          <div className="relative h-4 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", barBg[overallStatus])}
              style={{ width: `${hasPlannedBudget ? Math.min(overallPct, 100) : totalSpent > 0 ? 100 : 0}%` }}
            />
            {overallPct > 100 && (
              <div className="absolute inset-0 flex items-center justify-end pr-2">
                <span className="text-[9px] font-bold text-destructive-foreground">+{formatCurrency(Math.abs(totalRemaining))}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Gasto: {formatCurrency(totalSpent)}</span>
             <span>Meta: {formatCurrency(totalPlanned)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="pt-2">
        <h2 className="font-heading text-lg font-extrabold">Limites por categoria <span className="text-sm font-normal text-muted-foreground">(opcional)</span></h2>
        <p className="text-xs text-muted-foreground">Use apenas se quiser dividir sua meta entre alimentação, moradia, lazer e outras categorias.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={openNew}
          disabled={unbudgetedCategories.length === 0 || isMutating}
          className="gap-1.5 gradient-primary text-primary-foreground text-xs rounded-xl h-9"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar orçamento
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs h-9" onClick={handleCopyPrevious} disabled={isMutating}>
          Copiar mês anterior
        </Button>
      </div>

      {/* Budget list */}
      {enrichedBudgets.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-10 text-center">
            <Target className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum orçamento definido para este mês.</p>
            <p className="text-xs text-muted-foreground mt-1">Defina limites por categoria para controlar seus gastos.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              <Button
                onClick={openNew}
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={unbudgetedCategories.length === 0 || isMutating}
              >
                <Plus className="h-3.5 w-3.5" /> Criar orçamento
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyPrevious} disabled={isMutating}>
                Copiar mês anterior
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {enrichedBudgets.map((b) => {
            const isExpanded = expandedId === b.id;
            const cappedPct = Math.max(0, Math.min(b.pct, 100));
            const excess = b.spent > b.limit_amount ? b.spent - b.limit_amount : 0;

            return (
              <Card key={b.id} className={cn("border-0 shadow-card overflow-hidden transition-all", b.status === "danger" && "ring-1 ring-destructive/20")}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="w-full text-left p-4 space-y-2.5"
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: b.cat?.color || "#AEB6BF" }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-heading text-sm font-bold">
                            {b.cat?.name || "Sem categoria"}
                          </p>
                          {b.includesSubcategories && (
                            <p className="text-[10px] text-muted-foreground">Inclui subcategorias</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={cn(
                            "text-[10px] font-bold",
                            b.status === "success" && "bg-success/15 text-success border-success/30",
                            b.status === "warning" && "bg-warning/15 text-warning border-warning/30",
                            b.status === "danger" && "bg-destructive/15 text-destructive border-destructive/30",
                          )}
                        >
                          {b.pct.toFixed(0)}%
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500 ease-out", barBg[b.status])}
                        style={{ width: `${cappedPct}%` }}
                      />
                    </div>

                    {/* Values */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        <span className={cn("font-bold", statusStyles[b.status])}>{formatCurrency(b.spent)}</span>
                        {" / "}
                        {formatCurrency(b.limit_amount)}
                      </span>
                      {excess > 0 ? (
                        <span className="font-bold text-destructive flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> +{formatCurrency(excess)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Restam <span className="font-bold text-success">{formatCurrency(b.remaining)}</span>
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 px-4 py-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 rounded-xl"
                        onClick={() => openEdit(b)}
                        disabled={isMutating}
                      >
                        Editar valor
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1.5 text-destructive hover:text-destructive rounded-xl"
                        onClick={() => handleDelete(b.id)}
                        disabled={isMutating}
                      >
                        {deletingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Remover
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Unplanned expenses */}
      {unplannedExpenses.length > 0 && (
        <Card className="border-0 shadow-card border-l-4 border-l-warning">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-heading text-sm font-bold">Gastos sem orçamento</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Inclui despesas sem categoria e categorias que ainda não possuem limite definido.
            </p>
            <div className="space-y-1.5">
              {unplannedExpenses.map((item) => (
                <div key={item.catId} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-destructive">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(legacyPaymentExpenses.length > 0 || legacyPaymentBudgets.length > 0) && (
        <Card className="border-0 shadow-card border-l-4 border-l-muted-foreground">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading text-sm font-bold">Categorias bancárias legadas</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Estes gastos continuam no total do mês. Banco e cartão devem indicar a conta ou a forma de pagamento;
              reclassifique as despesas por finalidade na aba Transações. Limites bancários antigos não entram mais
              no valor planejado e podem ser removidos abaixo.
            </p>

            {legacyPaymentExpenses.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gastos do mês</p>
                {legacyPaymentExpenses.map((item) => (
                  <div key={`expense-${item.catId}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {legacyPaymentBudgets.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Limites antigos</p>
                {legacyPaymentBudgets.map((budget) => {
                  const category = budget.category_id ? categoryById.get(budget.category_id) : undefined;
                  return (
                    <div key={`budget-${budget.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color || "#AEB6BF" }} />
                        <span className="truncate text-sm font-medium">{category?.name || "Categoria bancária"}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{formatCurrency(budget.limit_amount)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(budget.id)}
                          disabled={isMutating}
                          aria-label={`Remover limite antigo de ${category?.name || "categoria bancária"}`}
                        >
                          {deletingId === budget.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Remover
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingBudget ? "Editar orçamento" : "Novo orçamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingBudget && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Categoria</p>
                <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {unbudgetedCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color || "#ccc" }} />
                          {cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editingBudget && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: categoryById.get(editingBudget.category_id || "")?.color || "#ccc" }}
                />
                <span className="text-sm font-semibold">
                  {categoryById.get(editingBudget.category_id || "")?.name || "Categoria"}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Valor planejado (R$)</p>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Ex.: 500,00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-12 text-xl font-bold text-center border-2 focus:border-primary"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 gradient-primary text-primary-foreground font-semibold"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : editingBudget ? "Salvar alteração" : "Criar orçamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetPage;
