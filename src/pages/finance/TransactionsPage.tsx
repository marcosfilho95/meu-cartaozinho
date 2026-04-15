import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceLayout } from "@/components/finance/FinanceLayout";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Search, Trash2 } from "lucide-react";
import { formatCurrency, TRANSACTION_STATUS_COLORS, TRANSACTION_STATUS_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getFinanceTransactionsCache, setFinanceTransactionsCache } from "@/lib/financePageCache";
import { getFinanceTransactionsCache, setFinanceTransactionsCache } from "@/lib/financePageCache";

interface TransactionsPageProps {
  userId: string;
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ userId }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const headerProfile = useUserHeaderProfile(userId);

  const cachedTransactions = userId ? getFinanceTransactionsCache<any[]>(userId) || [] : [];
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, accounts!transactions_account_id_fkey(name), categories(name, color)")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    initialData: cachedTransactions,
    refetchOnWindowFocus: false,
    staleTime: 45_000,
  });

  React.useEffect(() => {
    if (!userId || !transactions) return;
    setFinanceTransactionsCache(userId, transactions);
  }, [userId, transactions]);

  const filtered = useMemo(
    () =>
      transactions.filter((tx: any) => {
        if (typeFilter !== "all" && tx.type !== typeFilter) return false;
        if (statusFilter !== "all" && tx.status !== statusFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!(tx.source || "").toLowerCase().includes(s) && !(tx.notes || "").toLowerCase().includes(s)) return false;
        }
        return true;
      }),
    [transactions, typeFilter, statusFilter, search],
  );

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Transação removida");
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach((tx: any) => {
      const date = tx.transaction_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(tx);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <FinanceLayout userId={userId}>
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
            <SelectTrigger className="h-9 w-[90px] rounded-xl text-xs">
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

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {isLoading && transactions.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-sm">Nenhuma transação encontrada.</p>
          </div>
        ) : (
          grouped.map(([date, txs]) => (
            <div key={date}>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <div className="space-y-1.5">
                {txs.map((tx: any) => (
                  <Card key={tx.id} className="border-0 shadow-card transition-all hover:shadow-elevated">
                    <CardContent className="flex items-center gap-2.5 p-3.5">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          tx.type === "income" ? "bg-success/10" : "bg-destructive/10",
                        )}
                      >
                        {tx.type === "income" ? (
                          <ArrowUpCircle className="h-4.5 w-4.5 text-success" />
                        ) : (
                          <ArrowDownCircle className="h-4.5 w-4.5 text-destructive" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tx.source || "Sem descrição"}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {tx.categories && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">{tx.categories.name}</span>
                          )}
                          {tx.accounts && <span className="text-[10px] text-muted-foreground">{tx.accounts.name}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-bold", tx.type === "income" ? "text-success" : "text-foreground")}>
                          {tx.type === "income" ? "+" : "-"}
                          {formatCurrency(Number(tx.amount))}
                        </p>
                        <Badge variant="outline" className={cn("px-1 py-0 text-[9px]", TRANSACTION_STATUS_COLORS[tx.status])}>
                          {TRANSACTION_STATUS_LABELS[tx.status]}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(tx.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </FinanceLayout>
  );
};

export default TransactionsPage;
