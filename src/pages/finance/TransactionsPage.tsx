import React, { useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ArrowDownCircle, ArrowUpCircle, Check, CheckCircle2, Clock, Loader2, Search, Trash2 } from "lucide-react";
import { formatCurrency, TRANSACTION_STATUS_COLORS, TRANSACTION_STATUS_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { buildCategoryColorMap } from "@/lib/categoryColors";

interface TransactionsPageProps {
  userId: string;
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const addMonthsToKey = (key: string, amount: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + amount, 1);
  return monthKey(d);
};
const txDueDay = (tx: any) => {
  const fromDueDate = tx?.due_date ? Number(String(tx.due_date).slice(8, 10)) : 0;
  const fromAccount = Number(tx?.accounts?.due_day || 0);
  const resolved = fromDueDate || fromAccount || 31;
  return Math.max(1, Math.min(31, resolved));
};

const isExpenseInDynamicCycle = (tx: any, currentMonth: string, todayDay: number) => {
  const month = String(tx.transaction_date || "").slice(0, 7);
  const due = txDueDay(tx);
  const activeMonth = todayDay > due ? addMonthsToKey(currentMonth, 1) : currentMonth;
  const carry = month < activeMonth && (tx.status === "pending" || tx.status === "overdue");
  return month === activeMonth || carry;
};

const PAGE_SIZE = 50;

const TransactionRow = React.memo(({ tx, togglingId, onToggle, onDelete, colorMap }: {
  tx: any; togglingId: string | null; onToggle: (tx: any) => void; onDelete: (id: string) => void; colorMap: Record<string, string>;
}) => {
  const isPaid = tx.status === "paid";
  const isToggling = togglingId === tx.id;
  const catColor = colorMap[tx.category_id] || "#AEB6BF";

  return (
    <Card className={cn("border-0 shadow-card transition-all hover:shadow-elevated", isPaid && "opacity-75")}>
      <CardContent className="flex items-center gap-2 p-3">
        <button
          type="button"
          disabled={isToggling}
          onClick={() => onToggle(tx)}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            isPaid
              ? "border-success bg-success/15 text-success"
              : "border-primary/40 text-primary/60 hover:border-success hover:bg-success/10 hover:text-success"
          )}
          title={isPaid ? "Desfazer" : "Confirmar pagamento"}
        >
          {isToggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isPaid ? (
            <Check className="h-4 w-4" />
          ) : (
            <Check className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>

        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tx.type === "income" ? "bg-success/10" : "bg-destructive/10")}>
          {tx.type === "income" ? <ArrowUpCircle className="h-4 w-4 text-success" /> : <ArrowDownCircle className="h-4 w-4 text-destructive" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", isPaid && "line-through text-muted-foreground")}>{tx.source || "Sem descrição"}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {tx.payment_method && (
              <span className="text-[10px] text-muted-foreground capitalize">{tx.payment_method === "credit" ? "Crédito" : tx.payment_method === "debit" ? "Débito" : tx.payment_method}</span>
            )}
            {!tx.payment_method && tx.accounts && (
              <span className="text-[10px] text-muted-foreground">{tx.accounts.name}</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("text-sm font-bold", tx.type === "income" ? "text-success" : "text-foreground")}>
            {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
          </p>
          <Badge variant="outline" className={cn("px-1 py-0 text-[9px]", TRANSACTION_STATUS_COLORS[tx.status])}>
            {TRANSACTION_STATUS_LABELS[tx.status]}
          </Badge>
        </div>

        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => onDelete(tx.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
});
TransactionRow.displayName = "TransactionRow";

const TransactionsPage: React.FC<TransactionsPageProps> = ({ userId }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"billing" | "calendar">("billing");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [bulkPayingCategory, setBulkPayingCategory] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const currentMonth = monthKey(new Date());
  const todayDay = new Date().getDate();

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ["transactions", userId],
    queryFn: async () => {
      const [txRes, catRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, amount, type, status, transaction_date, due_date, account_id, category_id, source, notes, payment_method, accounts!transactions_account_id_fkey(name, type, due_day, current_balance), categories(id, name, color)")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("transaction_date", { ascending: false })
          .limit(500),
        supabase.from("categories").select("id, name, color").eq("user_id", userId),
      ]);
      if (txRes.error) throw txRes.error;
      return { transactions: txRes.data || [], categories: catRes.data || [] };
    },
    enabled: !!userId,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const transactions = rawData?.transactions || [];
  const categoryColorMap = useMemo(
    () => buildCategoryColorMap(rawData?.categories || []),
    [rawData?.categories],
  );

  React.useEffect(() => {
    const onFinanceSync = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string }>;
      if (custom.detail?.userId && custom.detail.userId !== userId) return;
      queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
    };
    window.addEventListener("finance-sync-updated", onFinanceSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onFinanceSync as EventListener);
  }, [queryClient, userId]);

  const scopedTransactions = useMemo(() => {
    if (viewMode === "calendar") {
      return transactions.filter((tx: any) => tx.transaction_date?.startsWith(currentMonth));
    }
    return transactions.filter((tx: any) => {
      if (tx.type === "income") return String(tx.transaction_date || "").slice(0, 7) === currentMonth;
      return isExpenseInDynamicCycle(tx, currentMonth, todayDay);
    });
  }, [transactions, viewMode, currentMonth, todayDay]);

  const monthSummary = useMemo(() => {
    const monthTx = scopedTransactions.filter((tx: any) => tx.status !== "canceled");
    const totalIncome = monthTx.filter((tx: any) => tx.type === "income").reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    const totalExpense = monthTx.filter((tx: any) => tx.type === "expense").reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    const paidExpense = monthTx.filter((tx: any) => tx.type === "expense" && tx.status === "paid").reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    const pendingExpense = monthTx.filter((tx: any) => tx.type === "expense" && (tx.status === "pending" || tx.status === "overdue")).reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    return { totalIncome, totalExpense, paidExpense, pendingExpense, balance: totalIncome - totalExpense };
  }, [scopedTransactions]);

  const filtered = useMemo(
    () =>
      scopedTransactions.filter((tx: any) => {
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        if (statusFilter !== "all" && tx.status !== statusFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!(tx.source || "").toLowerCase().includes(s) && !(tx.notes || "").toLowerCase().includes(s)) return false;
        }
        return true;
      }),
    [scopedTransactions, typeFilter, statusFilter, search],
  );

  // Reset visible count when filters change
  React.useEffect(() => { setVisibleCount(PAGE_SIZE); }, [typeFilter, statusFilter, search, viewMode]);

  const handleToggleStatus = useCallback(async (tx: any) => {
    const newStatus = tx.status === "paid" ? "pending" : "paid";
    setTogglingId(tx.id);
    try {
      const { error } = await supabase.from("transactions").update({ status: newStatus }).eq("id", tx.id);
      if (error) throw error;

      if (tx.accounts) {
        const currentBalance = Number(tx.accounts.current_balance || 0);
        const amount = Number(tx.amount);
        const balanceChange = newStatus === "paid"
          ? (tx.type === "income" ? amount : -amount)
          : (tx.type === "income" ? -amount : amount);
        await supabase.from("accounts").update({ current_balance: currentBalance + balanceChange }).eq("id", tx.account_id);
      }

      toast.success(newStatus === "paid" ? "✅ Confirmado!" : "Voltou para pendente");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha ao atualizar"));
    } finally {
      setTogglingId(null);
    }
  }, [queryClient, userId]);

  const handleBulkPay = useCallback(async (categoryName: string, txs: any[]) => {
    const pending = txs.filter((tx: any) => tx.status === "pending" || tx.status === "overdue");
    if (pending.length === 0) return;
    setBulkPayingCategory(categoryName);
    try {
      const ids = pending.map((tx: any) => tx.id);
      const { error } = await supabase.from("transactions").update({ status: "paid" as const }).in("id", ids);
      if (error) throw error;

      const accountUpdates: Record<string, number> = {};
      pending.forEach((tx: any) => {
        if (tx.account_id) {
          const change = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
          accountUpdates[tx.account_id] = (accountUpdates[tx.account_id] || 0) + change;
        }
      });
      for (const [accId, change] of Object.entries(accountUpdates)) {
        const acc = pending.find((tx: any) => tx.account_id === accId)?.accounts;
        if (acc) {
          await supabase.from("accounts").update({ current_balance: Number(acc.current_balance || 0) + change }).eq("id", accId);
        }
      }

      toast.success(`✅ ${pending.length} transações confirmadas!`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha"));
    } finally {
      setBulkPayingCategory(null);
    }
  }, [queryClient, userId]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transação removida");
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
  }, [queryClient, userId]);

  // Group by category using centralized color map
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, { name: string; color: string; txs: any[] }> = {};
    filtered.forEach((tx: any) => {
      const catName = tx.categories?.name || "Sem categoria";
      const catColor = categoryColorMap[tx.category_id] || "#AEB6BF";
      if (!groups[catName]) groups[catName] = { name: catName, color: catColor, txs: [] };
      groups[catName].txs.push(tx);
    });
    return Object.values(groups).sort((a, b) => {
      const aPending = a.txs.filter((t) => t.status === "pending" || t.status === "overdue").length;
      const bPending = b.txs.filter((t) => t.status === "pending" || t.status === "overdue").length;
      return bPending - aPending || b.txs.length - a.txs.length;
    });
  }, [filtered, categoryColorMap]);

  // Flatten for pagination
  const allGroupsWithPagination = useMemo(() => {
    let totalShown = 0;
    return groupedByCategory.map((group) => {
      const remaining = visibleCount - totalShown;
      if (remaining <= 0) return { ...group, visibleTxs: [] };
      const visibleTxs = group.txs.slice(0, remaining);
      totalShown += visibleTxs.length;
      return { ...group, visibleTxs };
    }).filter((g) => g.visibleTxs.length > 0);
  }, [groupedByCategory, visibleCount]);

  const totalItems = filtered.length;
  const hasMore = visibleCount < totalItems;

  const monthLabel =
    viewMode === "billing"
      ? "Ciclo de fatura (dinâmico)"
      : `${new Date(`${currentMonth}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;

  return (
    <>
      {/* Summary cards */}
      <div className="mx-auto max-w-5xl px-4 pt-2 pb-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{monthLabel}</p>
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card p-1">
            <button type="button" onClick={() => setViewMode("billing")}
              className={cn("rounded-lg px-2.5 py-1 text-[11px] font-semibold", viewMode === "billing" ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Ciclo de fatura
            </button>
            <button type="button" onClick={() => setViewMode("calendar")}
              className={cn("rounded-lg px-2.5 py-1 text-[11px] font-semibold", viewMode === "calendar" ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Calendário
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="border-0 shadow-card"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Receitas</p>
            <p className="text-sm font-bold text-success">{formatCurrency(monthSummary.totalIncome)}</p>
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Despesas</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(monthSummary.totalExpense)}</p>
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Check className="h-3 w-3 text-success" />Pago</p>
            <p className="text-sm font-bold text-success">{formatCurrency(monthSummary.paidExpense)}</p>
          </CardContent></Card>
          <Card className="border-0 shadow-card"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3 text-warning" />Pendente</p>
            <p className="text-sm font-bold text-warning">{formatCurrency(monthSummary.pendingExpense)}</p>
          </CardContent></Card>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl gap-2 px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 rounded-xl pl-9 text-sm" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[90px] rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
              <SelectItem value="income">Receitas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[100px] rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="overdue">Atrasados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transaction list grouped by category */}
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {isLoading && transactions.length === 0 ? (
          <div className="space-y-2 py-2">
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <p className="pt-1 text-center text-xs text-muted-foreground">Carregando transações...</p>
          </div>
        ) : allGroupsWithPagination.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-sm">Nenhuma transação encontrada.</p>
          </div>
        ) : (
          <>
            {allGroupsWithPagination.map((group) => {
              const pendingCount = group.txs.filter((tx: any) => tx.status === "pending" || tx.status === "overdue").length;
              const pendingTotal = group.txs.filter((tx: any) => tx.status === "pending" || tx.status === "overdue").reduce((s: number, tx: any) => s + Number(tx.amount), 0);
              const isBulking = bulkPayingCategory === group.name;

              return (
                <div key={group.name}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                      <p className="text-[12px] font-bold uppercase tracking-wider text-foreground">
                        {group.name}
                      </p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.txs.length}</Badge>
                    </div>
                    {pendingCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBulking}
                        onClick={() => handleBulkPay(group.name, group.txs)}
                        className="h-7 gap-1.5 rounded-xl border-success/40 text-[11px] font-semibold text-success hover:bg-success/10 hover:text-success"
                      >
                        {isBulking ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Confirmar tudo ({formatCurrency(pendingTotal)})
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {group.visibleTxs.map((tx: any) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        togglingId={togglingId}
                        onToggle={handleToggleStatus}
                        onDelete={handleDelete}
                        colorMap={categoryColorMap}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="rounded-xl text-xs"
                >
                  Carregar mais ({totalItems - visibleCount} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default TransactionsPage;
