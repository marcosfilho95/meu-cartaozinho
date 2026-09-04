import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthNavigator } from "@/components/MonthNavigator";

import { ArrowDownCircle, ArrowUpCircle, Check, Clock, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatCurrency, TRANSACTION_STATUS_COLORS, TRANSACTION_STATUS_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getFinanceTransactionsCache, setFinanceTransactionsCache } from "@/lib/financePageCache";
import { FinanceTx, fetchFinanceTransactions, getCycleScopedTransactions, monthKey } from "@/lib/financeShared";
import { getDashboardSummary } from "@/lib/financeSelectors";
import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { calculateAccountBalanceEffect } from "@/lib/financeOverview";
import { useSearchParams } from "react-router-dom";
import { emitFinanceSync, subscribeFinanceSync, type FinanceSyncDetail } from "@/lib/financeSyncBus";

interface TransactionsPageProps {
  userId: string;
}

const VISIBLE_BATCH_SIZE = 120;
const isMonthKey = (value: string | null): value is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");

const TransactionsPage: React.FC<TransactionsPageProps> = ({ userId }) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"billing" | "calendar">("calendar");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const requestedMonth = searchParams.get("mes");
    return isMonthKey(requestedMonth) ? requestedMonth : monthKey(new Date());
  });
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH_SIZE);
  const [editingTransaction, setEditingTransaction] = useState<FinanceTx | null>(null);
  const [addingTransaction, setAddingTransaction] = useState(false);

  const cachedTransactions = userId ? getFinanceTransactionsCache<FinanceTx[]>(userId) || [] : [];
  const todayDay = new Date().getDate();

  const changeMonth = (month: string) => {
    setSelectedMonth(month);
    const next = new URLSearchParams(searchParams);
    next.set("mes", month);
    setSearchParams(next, { replace: true });
  };

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey: ["transactions", userId],
    queryFn: () => fetchFinanceTransactions(userId, 18),
    enabled: !!userId,
    initialData: cachedTransactions,
    refetchOnWindowFocus: false,
    staleTime: 45_000,
  });

  React.useEffect(() => {
    if (!userId || !transactions) return;
    setFinanceTransactionsCache(userId, transactions);
  }, [userId, transactions]);

  React.useEffect(() => {
    const onFinanceSync = (detail: FinanceSyncDetail) => {
      if (detail?.userId && detail.userId !== userId) return;
      queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
      refetch();
    };
    return subscribeFinanceSync((detail) => onFinanceSync(detail));
  }, [queryClient, refetch, userId]);

  const scopedTransactions = useMemo(() => {
    if (viewMode === "calendar") {
      return transactions.filter((tx) => tx.transaction_date?.startsWith(selectedMonth));
    }

    return getCycleScopedTransactions(transactions, selectedMonth, todayDay);
  }, [transactions, viewMode, selectedMonth, todayDay]);

  const monthSummary = useMemo(() => getDashboardSummary(scopedTransactions), [scopedTransactions]);

  const filtered = useMemo(
    () =>
      scopedTransactions.filter((tx) => {
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        if (statusFilter !== "all" && tx.status !== statusFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!(tx.source || "").toLowerCase().includes(s) && !(tx.notes || "").toLowerCase().includes(s)) return false;
        }
        return true;
      }).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)),
    [scopedTransactions, typeFilter, statusFilter, search],
  );

  const visibleTransactions = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const handleToggleStatus = async (tx: FinanceTx) => {
    const newStatus = tx.status === "paid" ? "pending" : "paid";
    setTogglingId(tx.id);
    
    try {
      const updatePayload: any = { status: newStatus };
      if (newStatus === "paid") {
        updatePayload.notes = tx.notes ? tx.notes : null;
      }
      
      const { error } = await supabase
        .from("transactions")
        .update(updatePayload)
        .eq("id", tx.id);
      if (error) throw error;

      // Update account balance (recorrências futuras realizadas ainda não produzem efeito).
      if (tx.accounts) {
        const currentBalance = Number(tx.accounts.current_balance || 0);
        const previousEffect = calculateAccountBalanceEffect(tx);
        const nextEffect = calculateAccountBalanceEffect({ ...tx, status: newStatus });
        const balanceChange = nextEffect - previousEffect;
        
        if (Math.abs(balanceChange) > 0.001) {
          await supabase
            .from("accounts")
            .update({ current_balance: currentBalance + balanceChange })
            .eq("id", tx.account_id);
        }
      }

      toast.success(newStatus === "paid" ? "✅ Marcado como pago!" : "Marcado como pendente");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha ao atualizar"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (tx: FinanceTx) => {
    if (!window.confirm(`Excluir "${tx.source || "este lançamento"}"? Essa ação também corrige o saldo da conta.`)) return;
    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: deletedAt })
      .eq("id", tx.id)
      .eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (tx.status === "paid" && tx.account_id && (tx.type === "income" || tx.type === "expense")) {
      const { data: account, error: accountReadError } = await supabase
        .from("accounts")
        .select("id, current_balance")
        .eq("id", tx.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      const oldEffect = calculateAccountBalanceEffect(tx);
      const { error: balanceError } = accountReadError || !account
        ? { error: accountReadError || new Error("Conta do lançamento não encontrada.") }
        : await supabase
          .from("accounts")
          .update({ current_balance: Number(account.current_balance || 0) - oldEffect })
          .eq("id", tx.account_id)
          .eq("user_id", userId);
      if (balanceError) {
        await supabase.from("transactions").update({ deleted_at: null }).eq("id", tx.id).eq("user_id", userId);
        toast.error("Não foi possível corrigir o saldo; o lançamento não foi excluído.");
        return;
      }
    }

    toast.success("Transação removida");
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    emitFinanceSync({ userId });
  };

  const grouped = useMemo(() => {
    const groups: Record<string, FinanceTx[]> = {};
    visibleTransactions.forEach((tx) => {
      const date = tx.transaction_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(tx);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [visibleTransactions]);

  React.useEffect(() => {
    setVisibleCount(VISIBLE_BATCH_SIZE);
  }, [search, typeFilter, statusFilter, viewMode, selectedMonth]);

  React.useEffect(() => {
    if (visibleCount > filtered.length) {
      setVisibleCount(Math.max(VISIBLE_BATCH_SIZE, filtered.length));
    }
  }, [visibleCount, filtered.length]);

  const monthLabel =
    viewMode === "billing"
      ? "Ciclo de fatura por cartão (dinâmico)"
      : `Calendário de ${new Date(`${selectedMonth}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;

  return (
    <>
      {/* Summary cards */}
      <div className="mx-auto max-w-5xl px-4 pt-2 pb-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{monthLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">Encontre, edite ou exclua qualquer lançamento deste mês.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthNavigator currentMonth={selectedMonth} onMonthChange={changeMonth} />
            <Button className="h-10 gap-2" onClick={() => setAddingTransaction(true)}>
              <Plus className="h-4 w-4" /> Novo lançamento
            </Button>
          </div>
        </div>
        <div className="mb-2 flex justify-end">
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card p-1">
            <button
              type="button"
              onClick={() => setViewMode("billing")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold",
                viewMode === "billing" ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Ciclo de fatura
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold",
                viewMode === "calendar" ? "gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Calendário
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Receitas</p>
              <p className="text-sm font-bold text-success">{formatCurrency(monthSummary.totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Despesas</p>
              <p className="text-sm font-bold text-destructive">{formatCurrency(monthSummary.totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Check className="h-3 w-3 text-success" />Pago</p>
              <p className="text-sm font-bold text-success">{formatCurrency(monthSummary.paidExpense)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3 text-warning" />Pendente</p>
              <p className="text-sm font-bold text-warning">{formatCurrency(monthSummary.pendingExpense)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl gap-2 px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[90px] rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
              <SelectItem value="income">Receitas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[100px] rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="overdue">Atrasados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transaction list */}
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {isLoading && transactions.length === 0 ? (
          <div className="space-y-2 py-2">
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
            <p className="pt-1 text-center text-xs text-muted-foreground">Carregando transações...</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Nenhum lançamento neste mês.</p>
            <p className="mt-1 text-xs">Navegue pelos meses ou adicione um novo registro.</p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => setAddingTransaction(true)}>
              <Plus className="h-4 w-4" /> Adicionar lançamento
            </Button>
          </div>
        ) : (
          <>
            {grouped.map(([date, txs]) => (
              <div key={date}>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <div className="space-y-1.5">
                {txs.map((tx) => {
                  const isPaid = tx.status === "paid";
                  const isToggling = togglingId === tx.id;

                  return (
                    <Card
                      key={tx.id}
                      className={cn(
                        "border-0 shadow-card transition-all hover:shadow-elevated",
                        isPaid && "opacity-80"
                      )}
                    >
                      <CardContent className="flex items-center gap-2 p-3">
                        {/* Status toggle button */}
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleStatus(tx)}
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                            isPaid
                              ? "border-success bg-success/15 text-success"
                              : "border-muted-foreground/30 text-muted-foreground hover:border-success hover:text-success"
                          )}
                          title={isPaid ? "Marcar como pendente" : "Marcar como pago"}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isPaid ? (
                            <Check className="h-4 w-4" />
                          ) : null}
                        </button>

                        {/* Type icon */}
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                            tx.type === "income" ? "bg-success/10" : "bg-destructive/10",
                          )}
                        >
                          {tx.type === "income" ? (
                            <ArrowUpCircle className="h-4 w-4 text-success" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-medium", isPaid && "line-through text-muted-foreground")}>
                            {tx.source || "Sem descrição"}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {tx.categories && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">{tx.categories.name}</span>
                            )}
                            {tx.payment_method && (
                              <span className="text-[10px] text-muted-foreground capitalize">{tx.payment_method}</span>
                            )}
                            {!tx.payment_method && tx.accounts && (
                              <span className="text-[10px] text-muted-foreground">{tx.accounts.name}</span>
                            )}
                          </div>
                        </div>

                        {/* Amount + status */}
                        <div className="shrink-0 text-right">
                          <p className={cn("text-sm font-bold", tx.type === "income" ? "text-success" : "text-foreground")}>
                            {tx.type === "income" ? "+" : "-"}
                            {formatCurrency(Number(tx.amount))}
                          </p>
                          <Badge variant="outline" className={cn("px-1 py-0 text-[9px]", TRANSACTION_STATUS_COLORS[tx.status])}>
                            {TRANSACTION_STATUS_LABELS[tx.status]}
                          </Badge>
                        </div>

                        {/* Edit/delete actions */}
                        <div className="flex shrink-0 items-center gap-1">
                          {tx.type !== "transfer" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 rounded-lg px-2 text-muted-foreground hover:text-primary"
                              onClick={() => setEditingTransaction(tx)}
                              aria-label={`Editar ${tx.source || "lançamento"}`}
                              title="Editar lançamento"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="hidden text-[11px] sm:inline">Editar</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 rounded-lg px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => void handleDelete(tx)}
                            aria-label={`Excluir ${tx.source || "lançamento"}`}
                            title="Excluir lançamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden text-[11px] sm:inline">Excluir</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            ))}
            {visibleCount < filtered.length && (
              <div className="pt-2 text-center">
                <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + VISIBLE_BATCH_SIZE)}>
                  Carregar mais ({Math.min(VISIBLE_BATCH_SIZE, filtered.length - visibleCount)} de {filtered.length - visibleCount})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <AddTransactionDialog
        key={editingTransaction?.id || "no-edit"}
        open={Boolean(editingTransaction) || addingTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTransaction(null);
            setAddingTransaction(false);
          }
        }}
        userId={userId}
        defaultType={editingTransaction?.type === "income" ? "income" : "expense"}
        defaultDate={`${selectedMonth}-05`}
        editingTransaction={editingTransaction}
        onSaved={() => void refetch()}
      />
    </>
  );
};

export default TransactionsPage;
