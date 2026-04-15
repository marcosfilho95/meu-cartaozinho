import React, { useCallback, useEffect, useMemo, useState } from "react";
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
};

type Category = {
  id: string;
  name: string;
  color: string | null;
  kind: string;
  icon: string | null;
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

const getStatusColor = (pct: number): StatusColor => {
  if (pct >= 100) return "danger";
  if (pct >= 80) return "warning";
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
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const refMonth = getMonthKey(currentDate);

  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Record<string, number>>({});
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const navigateMonth = (dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const monthStart = `${refMonth}-01`;
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const monthEnd = getMonthKey(nextMonth) + "-01";

    const [budgetsRes, catsRes, txRes] = await Promise.all([
      supabase
        .from("budgets")
        .select("id, category_id, limit_amount, alert_threshold_pct, ref_month")
        .eq("user_id", userId)
        .eq("ref_month", refMonth),
      supabase
        .from("categories")
        .select("id, name, color, kind, icon")
        .eq("user_id", userId)
        .order("name"),
      supabase
        .from("transactions")
        .select("category_id, amount, type, status")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("transaction_date", monthStart)
        .lt("transaction_date", monthEnd),
    ]);

    setBudgets(budgetsRes.data || []);
    setCategories((catsRes.data as Category[]) || []);

    // Calculate expenses per category
    const expMap: Record<string, number> = {};
    let income = 0;
    (txRes.data || []).forEach((tx: any) => {
      if (tx.status === "canceled") return;
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
    setLoading(false);
  }, [userId, refMonth, currentDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Budget rows enriched with real data
  const enrichedBudgets = useMemo(() => {
    return budgets.map((b) => {
      const cat = categories.find((c) => c.id === b.category_id);
      const spent = b.category_id ? expenses[b.category_id] || 0 : 0;
      const pct = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0;
      const remaining = b.limit_amount - spent;
      const status = getStatusColor(pct);
      return { ...b, cat, spent, pct, remaining, status };
    }).sort((a, b) => b.pct - a.pct);
  }, [budgets, categories, expenses]);

  // Summary
  const totalPlanned = useMemo(() => budgets.reduce((s, b) => s + Number(b.limit_amount), 0), [budgets]);
  const totalSpent = useMemo(() => enrichedBudgets.reduce((s, b) => s + b.spent, 0), [enrichedBudgets]);
  const totalRemaining = totalPlanned - totalSpent;
  const overallPct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const projectedBalance = incomeTotal - totalPlanned;
  const realBalance = incomeTotal - totalSpent;

  // Categories not yet budgeted
  const unbugdetedCategories = useMemo(() => {
    const budgetedIds = new Set(budgets.map((b) => b.category_id));
    return categories.filter((c) => c.kind === "expense" && !budgetedIds.has(c.id));
  }, [categories, budgets]);

  // Categories with spending but no budget
  const unplannedExpenses = useMemo(() => {
    const budgetedIds = new Set(budgets.map((b) => b.category_id));
    return Object.entries(expenses)
      .filter(([catId]) => !budgetedIds.has(catId) && catId !== "uncategorized")
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return { catId, name: cat?.name || "Sem categoria", color: cat?.color || "#AEB6BF", amount };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, budgets, categories]);

  const handleSave = async () => {
    const amount = parseFloat(formAmount.replace(",", "."));
    if (!amount || amount <= 0) { toast.error("Informe um valor válido."); return; }
    if (!editingBudget && !formCategoryId) { toast.error("Selecione uma categoria."); return; }

    setSaving(true);
    try {
      if (editingBudget) {
        const { error } = await supabase
          .from("budgets")
          .update({ limit_amount: amount })
          .eq("id", editingBudget.id);
        if (error) throw error;
        toast.success("Orçamento atualizado!");
      } else {
        // Check duplicate
        const exists = budgets.find((b) => b.category_id === formCategoryId);
        if (exists) {
          toast.error("Já existe orçamento para essa categoria neste mês.");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("budgets").insert({
          user_id: userId,
          category_id: formCategoryId,
          ref_month: refMonth,
          limit_amount: amount,
        });
        if (error) throw error;
        toast.success("Orçamento criado!");
      }
      setDialogOpen(false);
      setEditingBudget(null);
      setFormCategoryId("");
      setFormAmount("");
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este orçamento?")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
      toast.success("Orçamento removido.");
      await loadData();
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

  // Quick-add all unbudgeted categories
  const handleQuickAddAll = async () => {
    if (unbugdetedCategories.length === 0) return;
    setSaving(true);
    try {
      const rows = unbugdetedCategories.map((cat) => ({
        user_id: userId,
        category_id: cat.id,
        ref_month: refMonth,
        limit_amount: 0,
      }));
      const { error } = await supabase.from("budgets").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} categorias adicionadas ao orçamento!`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erro");
    } finally {
      setSaving(false);
    }
  };

  // Copy budget from previous month
  const handleCopyPrevious = async () => {
    const prev = new Date(currentDate);
    prev.setMonth(prev.getMonth() - 1);
    const prevMonth = getMonthKey(prev);

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("budgets")
        .select("category_id, limit_amount")
        .eq("user_id", userId)
        .eq("ref_month", prevMonth);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("Nenhum orçamento no mês anterior.");
        setSaving(false);
        return;
      }

      const existingIds = new Set(budgets.map((b) => b.category_id));
      const newRows = data
        .filter((b) => !existingIds.has(b.category_id))
        .map((b) => ({
          user_id: userId,
          category_id: b.category_id,
          ref_month: refMonth,
          limit_amount: b.limit_amount,
        }));

      if (newRows.length === 0) {
        toast.info("Todas as categorias já possuem orçamento.");
        setSaving(false);
        return;
      }

      const { error: insertErr } = await supabase.from("budgets").insert(newRows);
      if (insertErr) throw insertErr;
      toast.success(`${newRows.length} orçamentos copiados do mês anterior!`);
      await loadData();
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

  const overallStatus = getStatusColor(overallPct);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigateMonth(-1)} className="rounded-xl border border-border p-2 hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h1 className="font-heading text-lg font-extrabold">{getMonthLabel(refMonth)}</h1>
          <p className="text-[11px] text-muted-foreground">Orçamento mensal</p>
        </div>
        <button onClick={() => navigateMonth(1)} className="rounded-xl border border-border p-2 hover:bg-muted transition-colors">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Planejado</p>
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
            <p className="text-[10px] text-muted-foreground">{overallPct.toFixed(0)}% do planejado</p>
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
            <h2 className="font-heading text-sm font-bold">Consumo geral do orçamento</h2>
            <Badge
              className={cn(
                "text-[10px] font-bold",
                overallStatus === "success" && "bg-success/15 text-success border-success/30",
                overallStatus === "warning" && "bg-warning/15 text-warning border-warning/30",
                overallStatus === "danger" && "bg-destructive/15 text-destructive border-destructive/30",
              )}
            >
              {overallPct.toFixed(0)}%
            </Badge>
          </div>
          <div className="relative h-4 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", barBg[overallStatus])}
              style={{ width: `${Math.min(overallPct, 100)}%` }}
            />
            {overallPct > 100 && (
              <div className="absolute inset-0 flex items-center justify-end pr-2">
                <span className="text-[9px] font-bold text-destructive-foreground">+{formatCurrency(Math.abs(totalRemaining))}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Gasto: {formatCurrency(totalSpent)}</span>
            <span>Planejado: {formatCurrency(totalPlanned)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={openNew} className="gap-1.5 gradient-primary text-primary-foreground text-xs rounded-xl h-9">
          <Plus className="h-3.5 w-3.5" /> Adicionar orçamento
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs h-9" onClick={handleCopyPrevious} disabled={saving}>
          Copiar mês anterior
        </Button>
        {unbugdetedCategories.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs h-9" onClick={handleQuickAddAll} disabled={saving}>
            Adicionar todas ({unbugdetedCategories.length})
          </Button>
        )}
      </div>

      {/* Budget list */}
      {enrichedBudgets.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-10 text-center">
            <Target className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum orçamento definido para este mês.</p>
            <p className="text-xs text-muted-foreground mt-1">Defina limites por categoria para controlar seus gastos.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Criar orçamento
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyPrevious}>
                Copiar mês anterior
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {enrichedBudgets.map((b) => {
            const isExpanded = expandedId === b.id;
            const cappedPct = Math.min(b.pct, 100);
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
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: b.cat?.color || "#AEB6BF" }}
                        />
                        <span className="font-heading text-sm font-bold truncate">
                          {b.cat?.name || "Sem categoria"}
                        </span>
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
                      >
                        Editar valor
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1.5 text-destructive hover:text-destructive rounded-xl"
                        onClick={() => handleDelete(b.id)}
                        disabled={deletingId === b.id}
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
              Estas categorias tiveram gastos mas não possuem orçamento definido.
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
                    {unbugdetedCategories.map((cat) => (
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
                  style={{ backgroundColor: categories.find((c) => c.id === editingBudget.category_id)?.color || "#ccc" }}
                />
                <span className="text-sm font-semibold">
                  {categories.find((c) => c.id === editingBudget.category_id)?.name || "Categoria"}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Valor planejado (R$)</p>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
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
