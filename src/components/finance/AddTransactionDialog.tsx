import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  Loader2,
  QrCode,
  Receipt,
  Wallet,
  Repeat,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeLabel } from "@/lib/financeShared";
import type { FinanceTx } from "@/lib/financeShared";
import { calculateAccountBalanceEffect } from "@/lib/financeOverview";

type TxType = "income" | "expense";
type PaymentMethod = "pix" | "boleto" | "credit" | "debit" | "cash";
type TxMode = "single" | "recurrence";
type RecurrenceFreq = "weekly" | "monthly" | "yearly";

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  defaultType?: TxType;
  defaultMode?: TxMode;
  defaultDate?: string;
  editingTransaction?: FinanceTx | null;
  onSaved?: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "pix", label: "Pix", icon: <QrCode className="h-4 w-4" /> },
  { value: "credit", label: "Crédito", icon: <CreditCard className="h-4 w-4" /> },
  { value: "debit", label: "Débito", icon: <CreditCard className="h-4 w-4" /> },
  { value: "cash", label: "Dinheiro", icon: <Wallet className="h-4 w-4" /> },
  { value: "boleto", label: "Boleto", icon: <Receipt className="h-4 w-4" /> },
];

const MODE_OPTIONS: { value: TxMode; label: string; icon: React.ReactNode }[] = [
  { value: "single", label: "Variável", icon: <Minus className="h-4 w-4" /> },
  { value: "recurrence", label: "Fixa", icon: <Repeat className="h-4 w-4" /> },
];

const LAST_PAYMENT_KEY = "finance_last_payment_method";

const normalize = normalizeLabel;

const isGenericCardCategory = (name?: string | null) => {
  const n = normalize(String(name || ""));
  return n === "cartao" || n === "cartoes";
};

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getNextDueDate = (dueDay: number) => {
  const safeDay = Math.max(1, Math.min(31, Number(dueDay || 1)));
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();

  const maxCurrent = new Date(y, m + 1, 0).getDate();
  const currentCandidate = new Date(y, m, Math.min(safeDay, maxCurrent));
  if (today <= safeDay) return toDateInput(currentCandidate);

  const y2 = m === 11 ? y + 1 : y;
  const m2 = (m + 1) % 12;
  const maxNext = new Date(y2, m2 + 1, 0).getDate();
  return toDateInput(new Date(y2, m2, Math.min(safeDay, maxNext)));
};

export const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
  open,
  onOpenChange,
  userId,
  defaultType = "expense",
  defaultMode = "single",
  defaultDate,
  editingTransaction = null,
  onSaved,
}) => {
  const queryClient = useQueryClient();

  const [type, setType] = useState<TxType>(defaultType);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => (localStorage.getItem(LAST_PAYMENT_KEY) as PaymentMethod) || "pix",
  );
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<TxMode>("single");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>("monthly");
  const [recurrenceDuration, setRecurrenceDuration] = useState("0");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => defaultDate || toDateInput(new Date()));
  const [status, setStatus] = useState<"pending" | "paid">("paid");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const isEditing = Boolean(editingTransaction);

  useEffect(() => {
    if (!open || editingTransaction) return;
    setType(defaultType);
    setMode(defaultMode);
    setTransactionDate(defaultDate || toDateInput(new Date()));
  }, [defaultDate, defaultMode, defaultType, editingTransaction, open]);

  useEffect(() => {
    if (!open || !editingTransaction) return;
    const editingType: TxType = editingTransaction.type === "income" ? "income" : "expense";
    const savedMethod = PAYMENT_METHODS.some((item) => item.value === editingTransaction.payment_method)
      ? editingTransaction.payment_method as PaymentMethod
      : editingType === "income" ? "pix" : "debit";
    setType(editingType);
    setPaymentMethod(savedMethod);
    setAccountId(editingTransaction.account_id || "");
    setCategoryId(editingTransaction.category_id || "");
    setMode("single");
    setAmount(Number(editingTransaction.amount).toFixed(2).replace(".", ","));
    setDescription(editingTransaction.source || "");
    setTransactionDate(editingTransaction.transaction_date);
    setStatus(editingTransaction.status === "paid" ? "paid" : "pending");
  }, [editingTransaction, open]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [accs, cats] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, due_day, current_balance, institution")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("categories")
          .select("id, name, kind, color, icon, parent_id")
          .eq("user_id", userId)
          .order("name"),
      ]);
      setAccounts(accs.data || []);
      setCategories(cats.data || []);
    };
    load();
  }, [open, userId]);

  useEffect(() => {
    setCategoryId((currentCategoryId) => {
      if (!currentCategoryId) return currentCategoryId;
      const currentCategory = categories.find((category) => category.id === currentCategoryId);
      return currentCategory?.kind === type ? currentCategoryId : "";
    });
  }, [categories, type]);

  const filteredCategories = useMemo(
    () => categories.filter((c: any) => c.kind === type && !isGenericCardCategory(c.name)),
    [categories, type],
  );

  const accountOptions = useMemo(() => {
    if (type === "income") return accounts.filter((account: any) => account.type !== "credit_card");
    if (paymentMethod === "credit") return accounts.filter((account: any) => account.type === "credit_card");
    if (paymentMethod === "cash") return accounts.filter((account: any) => account.type === "cash");
    return accounts.filter((account: any) => account.type !== "credit_card");
  }, [accounts, paymentMethod, type]);

  const selectedAccount = useMemo(() => accounts.find((account: any) => account.id === accountId) || null, [accounts, accountId]);

  useEffect(() => {
    if (isEditing) return;
    if (!selectedAccount) return;
    const dueDay = Number(selectedAccount?.due_day || 0);
    if (dueDay > 0) setTransactionDate(getNextDueDate(dueDay));
  }, [isEditing, selectedAccount]);

  useEffect(() => {
    if (accountId && accountOptions.some((account: any) => account.id === accountId)) return;
    setAccountId(accountOptions[0]?.id || "");
  }, [accountId, accountOptions]);

  const resolveAccountId = useCallback((): string | null => {
    if (accountId) return accountId;

    const typeMap: Record<string, string> = {
      pix: "checking",
      boleto: "checking",
      cash: "cash",
    };
    const targetType = typeMap[paymentMethod] || "checking";
    const match = accounts.find((a: any) => a.type === targetType);
    if (match?.id) return match.id;

    const fallbackNonCredit = accounts.find((a: any) => a.type !== "credit_card");
    return fallbackNonCredit?.id || accounts[0]?.id || null;
  }, [accountId, accounts, paymentMethod]);

  const numAmount = parseFloat(amount.replace(",", ".")) || 0;
  const recurrenceEndDate = useMemo(() => {
    const duration = Math.max(0, Number.parseInt(recurrenceDuration, 10) || 0);
    if (!duration) return null;
    const end = new Date(`${transactionDate}T12:00:00`);
    end.setMonth(end.getMonth() + duration - 1);
    return toDateInput(end);
  }, [recurrenceDuration, transactionDate]);

  const handleSave = async () => {
    if (!numAmount || numAmount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    if (!resolveAccountId()) {
      toast.error("Selecione uma conta financeira");
      return;
    }

    const accountId = resolveAccountId();
    if (!accountId) {
      toast.error("Nenhuma conta disponível. Acesse Contas para criar uma.");
      return;
    }

    setSaving(true);
    localStorage.setItem(LAST_PAYMENT_KEY, paymentMethod);

    try {
      const resolvedCategoryId = categoryId || null;
      if (editingTransaction) {
        const oldAmount = Number(editingTransaction.amount);
        const oldEffect = calculateAccountBalanceEffect(editingTransaction);
        const newEffect = calculateAccountBalanceEffect({ amount: numAmount, type, status });
        const oldAccount = accounts.find((account: any) => account.id === editingTransaction.account_id);
        const newAccount = accounts.find((account: any) => account.id === accountId);

        const updatePayload = {
          account_id: accountId,
          category_id: resolvedCategoryId,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          competence_month: transactionDate.slice(0, 7),
          due_date: transactionDate,
          status,
          source: description.trim(),
          payment_method: paymentMethod,
        };
        const { error } = await supabase
          .from("transactions")
          .update(updatePayload)
          .eq("id", editingTransaction.id)
          .eq("user_id", userId);
        if (error) throw error;

        const rollbackTransaction = async () => {
          await supabase
            .from("transactions")
            .update({
              account_id: editingTransaction.account_id,
              category_id: editingTransaction.category_id,
              type: editingTransaction.type,
              amount: oldAmount,
              transaction_date: editingTransaction.transaction_date,
              due_date: editingTransaction.due_date,
              status: editingTransaction.status,
              source: editingTransaction.source,
              payment_method: editingTransaction.payment_method,
            })
            .eq("id", editingTransaction.id)
            .eq("user_id", userId);
        };

        if (editingTransaction.account_id === accountId) {
          const delta = newEffect - oldEffect;
          if (Math.abs(delta) > 0.001 && !newAccount) {
            await rollbackTransaction();
            throw new Error("Conta do lançamento não encontrada para corrigir o saldo.");
          }
          if (newAccount && Math.abs(delta) > 0.001) {
            const { error: balanceError } = await supabase
              .from("accounts")
              .update({ current_balance: Number(newAccount.current_balance || 0) + delta })
              .eq("id", accountId)
              .eq("user_id", userId);
            if (balanceError) {
              await rollbackTransaction();
              throw balanceError;
            }
          }
        } else {
          if (Math.abs(oldEffect) > 0.001 && !oldAccount) {
            await rollbackTransaction();
            throw new Error("Conta anterior não encontrada para corrigir o saldo.");
          }
          if (Math.abs(newEffect) > 0.001 && !newAccount) {
            await rollbackTransaction();
            throw new Error("Nova conta não encontrada para corrigir o saldo.");
          }
          let oldBalanceChanged = false;
          if (oldAccount && Math.abs(oldEffect) > 0.001) {
            const { error: oldBalanceError } = await supabase
              .from("accounts")
              .update({ current_balance: Number(oldAccount.current_balance || 0) - oldEffect })
              .eq("id", editingTransaction.account_id)
              .eq("user_id", userId);
            if (oldBalanceError) {
              await rollbackTransaction();
              throw oldBalanceError;
            }
            oldBalanceChanged = true;
          }
          if (newAccount && Math.abs(newEffect) > 0.001) {
            const { error: newBalanceError } = await supabase
              .from("accounts")
              .update({ current_balance: Number(newAccount.current_balance || 0) + newEffect })
              .eq("id", accountId)
              .eq("user_id", userId);
            if (newBalanceError) {
              if (oldBalanceChanged && oldAccount) {
                await supabase
                  .from("accounts")
                  .update({ current_balance: Number(oldAccount.current_balance || 0) })
                  .eq("id", editingTransaction.account_id)
                  .eq("user_id", userId);
              }
              await rollbackTransaction();
              throw newBalanceError;
            }
          }
        }
      } else if (mode === "recurrence") {
        const { data: recurrence, error: recError } = await supabase
          .from("recurrences")
          .insert({
            user_id: userId,
            frequency: recurrenceFreq,
            auto_create: true,
            is_active: true,
            next_date: transactionDate,
            name: description.trim(),
            amount: numAmount,
            kind: type,
            account_id: accountId,
            category_id: resolvedCategoryId,
            day_of_month: Number(transactionDate.slice(8, 10)) || null,
            start_date: transactionDate,
            end_date: recurrenceEndDate,
            template_payload: {
              account_id: accountId,
              category_id: resolvedCategoryId,
              type,
              amount: numAmount,
              source: description.trim(),
              payment_method: paymentMethod,
              due_date: transactionDate,
            },
          })
          .select("id")
          .single();
        if (recError) throw recError;

        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          account_id: accountId,
          category_id: resolvedCategoryId,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          competence_month: transactionDate.slice(0, 7),
          due_date: transactionDate,
          status,
          recurrence_id: recurrence.id,
          source: description.trim(),
          payment_method: paymentMethod,
          notes: null,
        });
        if (txError) throw txError;
      } else {
        const { error } = await supabase.from("transactions").insert({
          user_id: userId,
          account_id: accountId,
          category_id: resolvedCategoryId,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          competence_month: transactionDate.slice(0, 7),
          due_date: transactionDate,
          status,
          source: description.trim(),
          payment_method: paymentMethod,
          notes: null,
        });
        if (error) throw error;
      }

      const account = accounts.find((a: any) => a.id === accountId);
      if (!editingTransaction && account && status === "paid") {
        const balanceChange = type === "income" ? numAmount : -numAmount;
        await supabase
          .from("accounts")
          .update({ current_balance: (account.current_balance || 0) + balanceChange })
          .eq("id", accountId);
      }

      toast.success(
        editingTransaction
          ? "Transação atualizada!"
          : mode === "recurrence"
            ? "Transação recorrente criada!"
            : "Transação registrada!",
      );

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
      try {
        window.dispatchEvent(new CustomEvent("finance-sync-updated", { detail: { userId } }));
      } catch {
        // ignore browser event failures
      }
      onSaved?.();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setCategoryId("");
    setAccountId("");
    setMode("single");
    setRecurrenceDuration("0");
    setStatus("paid");
    setTransactionDate(defaultDate || toDateInput(new Date()));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden rounded-2xl p-0">
        <DialogHeader className="px-5 pb-2 pt-5">
          <DialogTitle className="font-heading text-lg">{isEditing ? "Editar valor" : "Adicionar valor"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 pb-5">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              className={cn("h-11 gap-2", type === "expense" && "gradient-primary text-primary-foreground")}
              onClick={() => setType("expense")}
            >
              <ArrowDownCircle className="h-4 w-4" /> Despesa
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              className={cn("h-11 gap-2", type === "income" && "bg-success text-success-foreground hover:bg-success/90")}
              onClick={() => setType("income")}
            >
              <ArrowUpCircle className="h-4 w-4" /> Receita
            </Button>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-14 border-2 text-center text-2xl font-bold focus:border-primary"
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Input
              placeholder="Ex: Mercado, Salário, Netflix..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>

          {type === "expense" && (
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Como vai pagar?</Label>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => setPaymentMethod(pm.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                      paymentMethod === pm.value
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {pm.icon}
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-2 block text-xs text-muted-foreground">
              {paymentMethod === "credit" ? "Cartão financeiro" : "Conta"}
            </Label>
            <Select value={accountId || "none"} onValueChange={(value) => setAccountId(value === "none" ? "" : value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">Selecionar conta</SelectItem>
                {accountOptions.map((account: any) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                    {account.institution ? ` · ${account.institution}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accountOptions.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Crie uma conta financeira na tela Contas para usar este tipo de lançamento.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryId || "none"} onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {filteredCategories.map((cat: any) => (
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

          {!isEditing && <div>
            <Label className="mb-2 block text-xs text-muted-foreground">
              {type === "income" ? "Tipo de receita" : "Tipo de gasto"}
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-all",
                      mode === m.value
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {m.icon}
                    {m.value === "recurrence" && type === "income" ? "Fixa" : m.label}
                  </button>
                ))}
            </div>
          </div>}

          {mode === "recurrence" && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div>
                <Label className="text-xs text-muted-foreground">Frequência</Label>
                <Select value={recurrenceFreq} onValueChange={(v) => setRecurrenceFreq(v as RecurrenceFreq)}>
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Duração (meses, 0 = contínua)</Label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={recurrenceDuration}
                  onChange={(e) => setRecurrenceDuration(e.target.value)}
                  className="mt-1 h-10"
                  placeholder="0 para contínua"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {recurrenceDuration === "0" ? "Será cobrado continuamente" : `Por ${recurrenceDuration} meses`}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data de referência</Label>
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Use uma data dentro do mês que está organizando.</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "paid")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Realizado</SelectItem>
                  <SelectItem value="pending">Previsto</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">“Previsto” entra apenas no saldo projetado.</p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="gradient-primary h-12 w-full text-base font-semibold text-primary-foreground"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isEditing ? (
              "Salvar alterações"
            ) : mode === "recurrence" ? (
              "Salvar como valor fixo"
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
