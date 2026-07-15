import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage, untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";
import { cn } from "@/lib/utils";

interface ExpectedBillsPageProps {
  userId: string;
}

type ExpectedBill = {
  id: string;
  name: string;
  amount: number | null;
  due_date: string;
  status: "expected" | "pending" | "paid" | "overdue" | "ignored" | "canceled";
  account_id: string | null;
  category_id: string | null;
  accounts?: { name: string } | null;
  categories?: { name: string; color: string | null } | null;
};

type Account = { id: string; name: string; current_balance?: number | null };
type Category = { id: string; name: string; kind: string; color?: string | null };

const todayKey = () => new Date().toISOString().slice(0, 10);

const statusLabel: Record<ExpectedBill["status"], string> = {
  expected: "Prevista",
  pending: "Pendente",
  paid: "Paga",
  overdue: "Atrasada",
  ignored: "Ignorada",
  canceled: "Cancelada",
};

const statusClass: Record<ExpectedBill["status"], string> = {
  expected: "border-primary/30 bg-primary/10 text-primary",
  pending: "border-warning/35 bg-warning/15 text-warning",
  paid: "border-success/30 bg-success/15 text-success",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
  ignored: "border-border bg-muted text-muted-foreground",
  canceled: "border-border bg-muted text-muted-foreground",
};

const ExpectedBillsPage: React.FC<ExpectedBillsPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bills, setBills] = useState<ExpectedBill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayKey());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([ensureDefaultAccounts(userId), ensureDefaultCategories(userId)]);
      const [billsRes, accountsRes, categoriesRes] = await Promise.all([
        untypedSupabase
          .from("expected_bills")
          .select("id, name, amount, due_date, status, account_id, category_id, accounts(name), categories(name, color)")
          .eq("user_id", userId)
          .order("due_date", { ascending: true }),
        supabase.from("accounts").select("id, name, current_balance").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("categories").select("id, name, kind, color").eq("user_id", userId).eq("kind", "expense").order("name"),
      ]);

      if (billsRes.error) throw billsRes.error;
      setBills((billsRes.data || []) as ExpectedBill[]);
      setAccounts((accountsRes.data || []) as Account[]);
      setCategories((categoriesRes.data || []) as Category[]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao carregar contas previstas."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const active = bills.filter((bill) => !["paid", "ignored", "canceled"].includes(bill.status));
    return {
      total: active.reduce((sum, bill) => sum + Number(bill.amount || 0), 0),
      overdue: active.filter((bill) => bill.status === "overdue" || bill.due_date < todayKey()).length,
      next: active.filter((bill) => bill.due_date >= todayKey()).length,
    };
  }, [bills]);

  const resetForm = () => {
    setName("");
    setAmount("");
    setDueDate(todayKey());
    setAccountId("");
    setCategoryId("");
  };

  const handleCreate = async () => {
    const parsedAmount = Number(amount.replace(",", "."));
    if (!name.trim()) {
      toast.error("Informe o nome da conta.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await untypedSupabase.from("expected_bills").insert({
        user_id: userId,
        name: name.trim(),
        amount: parsedAmount,
        expected_min_amount: parsedAmount,
        expected_max_amount: parsedAmount,
        due_date: dueDate,
        status: dueDate < todayKey() ? "overdue" : "pending",
        account_id: accountId || null,
        category_id: categoryId || null,
        confidence: 1,
      });
      if (error) throw error;
      toast.success("Conta prevista criada.");
      resetForm();
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao criar conta prevista."));
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (bill: ExpectedBill) => {
    if (!bill.account_id) {
      toast.error("Defina uma conta antes de marcar como paga.");
      return;
    }

    setSaving(true);
    try {
      const { data: txRaw, error: txError } = await untypedSupabase
        .from("transactions")
        .insert({
          user_id: userId,
          account_id: bill.account_id,
          category_id: bill.category_id,
          type: "expense",
          amount: Number(bill.amount || 0),
          transaction_date: bill.due_date,
          due_date: bill.due_date,
          status: "paid",
          source: bill.name,
          notes: "Criada a partir de conta prevista",
          is_reviewed: true,
          source_origin: "expected_bill",
          metadata: { expectedBillId: bill.id },
        })
        .select("id")
        .single();
      if (txError) throw txError;
      const tx = txRaw as { id: string };

      const { error } = await untypedSupabase
        .from("expected_bills")
        .update({ status: "paid", transaction_id: tx.id })
        .eq("id", bill.id);
      if (error) throw error;

      toast.success("Conta marcada como paga.");
      window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao marcar como paga."));
    } finally {
      setSaving(false);
    }
  };

  const deleteBill = async (billId: string) => {
    const { error } = await untypedSupabase.from("expected_bills").delete().eq("id", billId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta prevista removida.");
    load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Previstas abertas</p>
            <p className="mt-1 text-2xl font-extrabold text-foreground">{summary.next}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor em aberto</p>
            <p className="mt-1 text-2xl font-extrabold text-warning">{formatCurrency(summary.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Atrasadas</p>
            <p className="mt-1 text-2xl font-extrabold text-destructive">{summary.overdue}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-0 shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h1 className="font-heading text-base font-bold">Nova conta prevista</h1>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_150px_150px_1fr_1fr_auto]">
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Energia, aluguel, internet" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valor</Label>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Conta</Label>
              <Select value={accountId || "none"} onValueChange={(value) => setAccountId(value === "none" ? "" : value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecionar depois</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={categoryId || "none"} onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button disabled={saving} onClick={handleCreate} className="h-10 gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        {bills.length === 0 ? (
          <Card className="border-2 border-dashed border-border">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma conta prevista cadastrada.</CardContent>
          </Card>
        ) : (
          bills.map((bill) => {
            const computedStatus = bill.status !== "paid" && bill.due_date < todayKey() ? "overdue" : bill.status;
            return (
              <Card key={bill.id} className="border-0 shadow-card">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {computedStatus === "overdue" ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CalendarClock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{bill.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${bill.due_date}T12:00:00`).toLocaleDateString("pt-BR")} · {bill.categories?.name || "Sem categoria"} · {bill.accounts?.name || "Sem conta"}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{formatCurrency(Number(bill.amount || 0))}</p>
                  <Badge variant="outline" className={cn("text-[10px]", statusClass[computedStatus])}>
                    {statusLabel[computedStatus]}
                  </Badge>
                  {computedStatus !== "paid" && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={saving} onClick={() => markPaid(bill)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Paguei
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteBill(bill.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
};

export default ExpectedBillsPage;
