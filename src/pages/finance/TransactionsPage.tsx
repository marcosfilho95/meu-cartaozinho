import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Search, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_STATUS_COLORS } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/AppHeader";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { getStoredProfile } from "@/lib/profileCache";
import { getStoredAvatarId } from "@/lib/profileAvatar";

interface TransactionsPageProps { userId: string; }

const TransactionsPage: React.FC<TransactionsPageProps> = ({ userId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const [profile, setProfile] = useState<{ name: string; avatar_id: string | null }>({ name: "", avatar_id: null });

  useEffect(() => {
    const cached = getStoredProfile(userId);
    if (cached) setProfile({ name: cached.name, avatar_id: cached.avatar_id ?? getStoredAvatarId(userId) ?? null });
  }, [userId]);

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
  });

  const filtered = useMemo(() => {
    return transactions.filter((tx: any) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(tx.source || "").toLowerCase().includes(s) && !(tx.notes || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, statusFilter, search]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
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
    <div className="min-h-screen bg-background pb-24">
      <AppHeader
        title="Transações"
        avatarId={profile.avatar_id}
        showBack
        backTo="/financas"
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <FinanceTopNav />

      {/* Filters */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40">
        <div className="mx-auto max-w-lg px-4 py-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm rounded-xl"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[90px] h-9 text-xs rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="expense">Despesas</SelectItem>
              <SelectItem value="income">Receitas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[90px] h-9 text-xs rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="overdue">Atrasados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-4 space-y-4 animate-fade-in">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Nenhuma transação encontrada.</p>
          </div>
        ) : (
          grouped.map(([date, txs]) => (
            <div key={date}>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider px-1">
                {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <div className="space-y-1.5">
                {txs.map((tx: any) => (
                  <Card key={tx.id} className="border-0 shadow-card transition-all hover:shadow-elevated">
                    <CardContent className="flex items-center gap-2.5 p-3.5">
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
                        tx.type === "income" ? "bg-success/10" : "bg-destructive/10"
                      )}>
                        {tx.type === "income" ? (
                          <ArrowUpCircle className="h-4.5 w-4.5 text-success" />
                        ) : (
                          <ArrowDownCircle className="h-4.5 w-4.5 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.source || "Sem descrição"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {tx.categories && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted font-medium">{tx.categories.name}</span>
                          )}
                          {tx.accounts && (
                            <span className="text-[10px] text-muted-foreground">{tx.accounts.name}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-bold", tx.type === "income" ? "text-success" : "text-foreground")}>
                          {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                        </p>
                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0", TRANSACTION_STATUS_COLORS[tx.status])}>
                          {TRANSACTION_STATUS_LABELS[tx.status]}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive rounded-lg" onClick={() => handleDelete(tx.id)}>
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

      <QuickTransactionFab userId={userId} />
      
    </div>
  );
};

export default TransactionsPage;
