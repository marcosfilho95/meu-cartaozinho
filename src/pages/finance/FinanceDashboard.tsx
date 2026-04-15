import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, Wallet, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { FinanceBottomNav } from "@/components/finance/FinanceBottomNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { AppLogo } from "@/components/AppLogo";
import { cn } from "@/lib/utils";

interface FinanceDashboardProps {
  userId: string;
}

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ userId }) => {
  const [summary, setSummary] = useState({ balance: 0, income: 0, expense: 0, pending: 0 });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

      const [accsRes, txRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("transactions").select("*").eq("user_id", userId).is("deleted_at", null)
          .gte("transaction_date", monthStart).lt("transaction_date", monthEnd).order("transaction_date", { ascending: false }),
      ]);

      const accs = accsRes.data || [];
      const txs = txRes.data || [];
      setAccounts(accs);
      setRecentTransactions(txs.slice(0, 5));

      const totalBalance = accs.reduce((s: number, a: any) => s + (a.include_in_net_worth ? Number(a.current_balance) : 0), 0);
      const income = txs.filter((t: any) => t.type === "income" && t.status !== "canceled").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const expense = txs.filter((t: any) => t.type === "expense" && t.status !== "canceled").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const pending = txs.filter((t: any) => t.status === "pending").reduce((s: number, t: any) => s + Number(t.amount), 0);
      setSummary({ balance: totalBalance, income, expense, pending });
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="gradient-primary px-4 pb-8 pt-6">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <AppLogo size="sm" />
            <h1 className="font-heading text-lg font-bold text-primary-foreground">Meu Cartãozinho</h1>
          </div>
          <p className="text-primary-foreground/80 text-sm mb-1">Saldo total</p>
          <p className="text-3xl font-bold font-heading text-primary-foreground">
            {formatCurrency(summary.balance)}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 -mt-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <ArrowUpCircle className="mx-auto h-5 w-5 text-success mb-1" />
              <p className="text-[10px] text-muted-foreground">Receitas</p>
              <p className="text-sm font-bold text-success">{formatCurrency(summary.income)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <ArrowDownCircle className="mx-auto h-5 w-5 text-destructive mb-1" />
              <p className="text-[10px] text-muted-foreground">Despesas</p>
              <p className="text-sm font-bold text-destructive">{formatCurrency(summary.expense)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="p-3 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-warning mb-1" />
              <p className="text-[10px] text-muted-foreground">Pendente</p>
              <p className="text-sm font-bold text-warning">{formatCurrency(summary.pending)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Accounts */}
        <div>
          <h2 className="font-heading text-sm font-semibold mb-2">Minhas Contas</h2>
          {accounts.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                <Wallet className="mx-auto h-8 w-8 mb-2 opacity-40" />
                Nenhuma conta cadastrada ainda.<br />
                Vá em <span className="font-medium text-primary">Contas</span> para adicionar.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {accounts.map((a: any) => (
                <Card key={a.id} className="border-0 shadow-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.institution || a.type}</p>
                    </div>
                    <p className={cn("text-sm font-bold", Number(a.current_balance) >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(Number(a.current_balance))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div>
          <h2 className="font-heading text-sm font-semibold mb-2">Últimas Transações</h2>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma transação este mês. Use o botão <span className="text-primary font-bold">+</span> para registrar!
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentTransactions.map((tx: any) => (
                <Card key={tx.id} className="border-0 shadow-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      {tx.type === "income" ? (
                        <ArrowUpCircle className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium truncate max-w-[180px]">{tx.source || "Sem descrição"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(tx.transaction_date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <p className={cn("text-sm font-bold", tx.type === "income" ? "text-success" : "text-foreground")}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickTransactionFab userId={userId} />
      <FinanceBottomNav />
    </div>
  );
};

export default FinanceDashboard;
