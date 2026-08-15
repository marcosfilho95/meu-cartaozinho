import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CalendarRange,
  Loader2,
  PiggyBank,
  Repeat,
  Upload,
  Wallet,
} from "lucide-react";

import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { DailyOrganizerPanel } from "@/components/finance/DailyOrganizerPanel";
import { ExpenseDistributionBar } from "@/components/finance/ExpenseDistributionBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import {
  addMonthsToKey,
  fetchFinanceTransactions,
  monthKey,
  type FinanceTx,
} from "@/lib/financeShared";
import { getExpensesByCategory } from "@/lib/financeSelectors";
import {
  fetchExpectedBillsForMonth,
  generateExpectedBillsForMonth,
  type FixedBillPreview,
} from "@/lib/finance/fixedBills";
import { cn } from "@/lib/utils";

interface FinanceHomeProps {
  userId: string;
}

type FixedExpense = {
  id: string;
  name: string | null;
  amount: number | null;
  day_of_month: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  is_active: boolean;
  template_payload: { source?: string; amount?: number; type?: string } | null;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  current_balance: number | null;
  include_in_net_worth: boolean;
};

const fullMonthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const inMonth = (tx: FinanceTx, key: string) => (tx.due_date || tx.transaction_date).slice(0, 7) === key;

const FinanceHome: React.FC<FinanceHomeProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [refMonth, setRefMonth] = useState(() => monthKey(new Date()));
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"expense" | "income">("expense");
  const [monthBills, setMonthBills] = useState<FixedBillPreview[]>([]);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
    try {
      const [txs, accountsRes, recurrencesRes] = await Promise.all([
        fetchFinanceTransactions(userId, 12),
        supabase
          .from("accounts")
          .select("id, name, type, current_balance, include_in_net_worth")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        untypedSupabase
          .from("recurrences")
          .select("id, name, amount, day_of_month, frequency, is_active, template_payload")
          .eq("user_id", userId)
          .eq("is_active", true),
      ]);
      setTransactions(txs || []);
      setAccounts((accountsRes.data || []) as AccountRow[]);
      setFixedExpenses(((recurrencesRes.data || []) as FixedExpense[]) || []);
    } catch {
      toast.error("Não foi possível carregar o painel financeiro.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const syncFixedBills = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return;
      setGenerating(true);
      try {
        const result = await generateExpectedBillsForMonth(userId, refMonth);
        const bills = await fetchExpectedBillsForMonth(userId, refMonth);
        setMonthBills(bills);
        if (!options?.silent) {
          toast.success(
            result.created > 0
              ? `${result.created} conta(s) fixa(s) gerada(s) para o mês.`
              : "Todas as contas fixas do mês já estão geradas.",
          );
        }
      } catch {
        if (!options?.silent) toast.error("Não foi possível gerar as contas fixas do mês.");
      } finally {
        setGenerating(false);
      }
    },
    [refMonth, userId],
  );

  useEffect(() => {
    if (userId) void load();
  }, [load, userId]);

  useEffect(() => {
    if (userId) void syncFixedBills({ silent: true });
  }, [syncFixedBills, userId]);

  useEffect(() => {
    const onSync = () => void load();
    window.addEventListener("finance-sync-updated", onSync as EventListener);
    return () => window.removeEventListener("finance-sync-updated", onSync as EventListener);
  }, [load]);

  const monthTransactions = useMemo(
    () => transactions.filter((tx) => inMonth(tx, refMonth) && tx.status !== "canceled"),
    [refMonth, transactions],
  );

  const income = useMemo(
    () => monthTransactions.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0),
    [monthTransactions],
  );
  const expenses = useMemo(
    () => monthTransactions.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0),
    [monthTransactions],
  );
  const pendingExpenses = useMemo(
    () =>
      monthTransactions
        .filter((tx) => tx.type === "expense" && (tx.status === "pending" || tx.status === "overdue"))
        .reduce((s, tx) => s + Number(tx.amount), 0),
    [monthTransactions],
  );
  const balance = income - expenses;

  const cashBalance = useMemo(
    () =>
      accounts
        .filter((account) => account.include_in_net_worth && account.type !== "credit_card")
        .reduce((sum, account) => sum + Number(account.current_balance || 0), 0),
    [accounts],
  );

  const distribution = useMemo(() => {
    const items = getExpensesByCategory(monthTransactions).slice(0, 6);
    return {
      items: items.map((item) => ({ id: item.key, name: item.label, value: item.value, color: item.color })),
      total: items.reduce((sum, item) => sum + item.value, 0),
    };
  }, [monthTransactions]);

  const fixedMonthlyTotal = useMemo(
    () =>
      fixedExpenses
        .filter((item) => item.frequency === "monthly")
        .reduce((sum, item) => sum + Number(item.amount ?? item.template_payload?.amount ?? 0), 0),
    [fixedExpenses],
  );

  const selectableMonths = useMemo(() => {
    const current = monthKey(new Date());
    return [addMonthsToKey(current, 1), current, ...[1, 2, 3, 4, 5].map((i) => addMonthsToKey(current, -i))];
  }, []);

  const handleTogglePaid = async (tx: FinanceTx) => {
    setTogglingId(tx.id);
    const { error } = await supabase.from("transactions").update({ status: "paid" }).eq("id", tx.id);
    setTogglingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lançamento marcado como pago.");
    setTransactions((current) => current.map((item) => (item.id === tx.id ? { ...item, status: "paid" } : item)));
  };

  const openDialog = (type: "expense" | "income") => {
    setDialogType(type);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 px-4">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Organizador</p>
            <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight capitalize">
              {fullMonthLabel(refMonth)}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              O que entrou, o que saiu e o que ainda falta pagar neste mês.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={refMonth} onValueChange={setRefMonth}>
              <SelectTrigger className="h-9 w-[190px] text-xs">
                <CalendarRange className="mr-2 h-3.5 w-3.5 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectableMonths.map((key) => (
                  <SelectItem key={key} value={key} className="capitalize">
                    {fullMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => navigate("/financas/importacoes")}>
              <Upload className="h-3.5 w-3.5" /> Importar
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <ArrowUpCircle className="h-5 w-5 text-success" />
              <p className="mt-2 text-[11px] text-muted-foreground">Entradas do mês</p>
              <p className="text-xl font-bold text-success">{formatCurrency(income)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
              <p className="mt-2 text-[11px] text-muted-foreground">Saídas do mês</p>
              <p className="text-xl font-bold text-destructive">{formatCurrency(expenses)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatCurrency(pendingExpenses)} ainda a pagar</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <PiggyBank className="h-5 w-5 text-primary" />
              <p className="mt-2 text-[11px] text-muted-foreground">Saldo do mês</p>
              <p className={cn("text-xl font-bold", balance >= 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(balance)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <Wallet className="h-5 w-5 text-primary" />
              <p className="mt-2 text-[11px] text-muted-foreground">Saldo em contas</p>
              <p className="text-xl font-bold">{formatCurrency(cashBalance)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{accounts.length} contas ativas</p>
            </CardContent>
          </Card>
        </section>

        <DailyOrganizerPanel
          userId={userId}
          transactions={transactions}
          togglingId={togglingId}
          onToggleTransaction={handleTogglePaid}
          onNewExpense={() => openDialog("expense")}
          onNewIncome={() => openDialog("income")}
          onViewTransactions={() => navigate("/financas/transacoes")}
        />

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-base font-bold">Para onde foi o dinheiro</h2>
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/relatorios")}>
                  Relatórios
                </Button>
              </div>
              <div className="mt-4">
                {distribution.total > 0 ? (
                  <ExpenseDistributionBar items={distribution.items} total={distribution.total} />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    Sem gastos registrados neste mês.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-base font-bold">Despesas fixas</h2>
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => navigate("/financas/recorrencias")}>
                  Gerenciar
                </Button>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Compromisso mensal</p>
              <p className="font-heading text-2xl font-extrabold">{formatCurrency(fixedMonthlyTotal)}</p>
              <div className="mt-3 space-y-1.5">
                {fixedExpenses.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    Cadastre suas contas fixas (aluguel, luz, assinaturas) para prever o mês.
                  </p>
                ) : (
                  fixedExpenses.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {item.name || item.template_payload?.source || "Recorrência"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.day_of_month ? `Todo dia ${item.day_of_month}` : "Mensal"}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {formatCurrency(Number(item.amount ?? item.template_payload?.amount ?? 0))}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <AddTransactionDialog
        key={dialogOpen ? `${dialogType}-open` : "closed"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        defaultType={dialogType}
      />
    </>
  );
};

export default FinanceHome;
