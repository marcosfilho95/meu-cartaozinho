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
  Banknote,
  CreditCard,
  Loader2,
  QrCode,
  Receipt,
  Wallet,
  Repeat,
  Layers,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/constants";
import { BankLogo } from "@/components/BankLogo";

/* ── Types ──────────────────────────────────────── */

type TxType = "income" | "expense";
type PaymentMethod = "pix" | "boleto" | "credit" | "debit" | "cash";
type TxMode = "single" | "installment" | "recurrence";
type RecurrenceFreq = "weekly" | "monthly" | "yearly";

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  defaultType?: TxType;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "pix", label: "Pix", icon: <QrCode className="h-4 w-4" /> },
  { value: "credit", label: "Crédito", icon: <CreditCard className="h-4 w-4" /> },
  { value: "debit", label: "Débito", icon: <CreditCard className="h-4 w-4" /> },
  { value: "cash", label: "Dinheiro", icon: <Wallet className="h-4 w-4" /> },
  { value: "boleto", label: "Boleto", icon: <Receipt className="h-4 w-4" /> },
];

const MODE_OPTIONS: { value: TxMode; label: string; icon: React.ReactNode }[] = [
  { value: "single", label: "Única", icon: <Minus className="h-4 w-4" /> },
  { value: "installment", label: "Parcelada", icon: <Layers className="h-4 w-4" /> },
  { value: "recurrence", label: "Recorrente", icon: <Repeat className="h-4 w-4" /> },
];

const LAST_PAYMENT_KEY = "finance_last_payment_method";

/* ── Component ──────────────────────────────────── */

export const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
  open,
  onOpenChange,
  userId,
  defaultType = "expense",
}) => {
  const queryClient = useQueryClient();

  // Form state
  const [type, setType] = useState<TxType>(defaultType);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => (localStorage.getItem(LAST_PAYMENT_KEY) as PaymentMethod) || "pix"
  );
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<TxMode>("single");
  const [installments, setInstallments] = useState("2");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>("monthly");
  const [recurrenceDuration, setRecurrenceDuration] = useState("0"); // 0 = continuous
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"pending" | "paid">("paid");
  const [saving, setSaving] = useState(false);

  // Data
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Load data on open
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [accs, cardsRes, cats] = await Promise.all([
        supabase.from("accounts").select("id, name, type").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("cards").select("id, name, brand, color").eq("user_id", userId).order("name"),
        supabase.from("categories").select("id, name, kind, color, icon").eq("user_id", userId).order("name"),
      ]);
      setAccounts(accs.data || []);
      setCards(cardsRes.data || []);
      setCategories(cats.data || []);
    };
    load();
  }, [open, userId]);

  // Reset when type changes
  useEffect(() => {
    setCategoryId("");
    if (type === "income") {
      setMode("single");
    }
  }, [type]);

  // Filter categories by type
  const filteredCategories = useMemo(
    () => categories.filter((c: any) => c.kind === type),
    [categories, type]
  );

  // Needs card selection?
  const needsCard = type === "expense" && (paymentMethod === "credit" || paymentMethod === "debit");

  // Auto-resolve account from payment method
  const resolveAccountId = useCallback((): string | null => {
    if (needsCard) {
      // Find account matching the card brand/name or first credit_card account
      const ccAccount = accounts.find((a: any) => a.type === "credit_card");
      return ccAccount?.id || accounts[0]?.id || null;
    }
    const typeMap: Record<string, string> = {
      pix: "checking",
      boleto: "checking",
      cash: "cash",
    };
    const targetType = typeMap[paymentMethod] || "checking";
    const match = accounts.find((a: any) => a.type === targetType);
    return match?.id || accounts[0]?.id || null;
  }, [accounts, paymentMethod, needsCard]);

  // Computed values
  const numAmount = parseFloat(amount.replace(",", ".")) || 0;
  const installmentCount = Math.max(2, parseInt(installments) || 2);
  const perInstallment = mode === "installment" && numAmount > 0 ? numAmount / installmentCount : 0;

  const handleSave = async () => {
    if (!numAmount || numAmount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    if (needsCard && !cardId && cards.length > 0) {
      toast.error("Selecione um cartão");
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
      if (mode === "installment" && type === "expense") {
        // Create multiple transactions for installments
        const rows = [];
        for (let i = 0; i < installmentCount; i++) {
          const installmentAmount = i === installmentCount - 1
            ? Math.round((numAmount - Math.floor((numAmount / installmentCount) * 100) / 100 * (installmentCount - 1)) * 100) / 100
            : Math.floor((numAmount / installmentCount) * 100) / 100;
          
          const date = new Date(transactionDate + "T12:00:00");
          date.setMonth(date.getMonth() + i);
          
          rows.push({
            user_id: userId,
            account_id: accountId,
            category_id: categoryId || null,
            type,
            amount: installmentAmount,
            transaction_date: date.toISOString().split("T")[0],
            status: i === 0 ? status : "pending",
            source: `${description.trim()} (${i + 1}/${installmentCount})`,
            payment_method: paymentMethod,
            notes: null,
          });
        }
        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw error;
      } else if (mode === "recurrence") {
        // Create recurrence record + first transaction
        const { error: recError } = await supabase.from("recurrences").insert({
          user_id: userId,
          frequency: recurrenceFreq,
          auto_create: true,
          is_active: true,
          next_date: transactionDate,
          template_payload: {
            account_id: accountId,
            category_id: categoryId || null,
            type,
            amount: numAmount,
            source: description.trim(),
            payment_method: paymentMethod,
          },
        });
        if (recError) throw recError;

        // Also create the first occurrence
        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId || null,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          status,
          source: description.trim(),
          payment_method: paymentMethod,
          notes: null,
        });
        if (txError) throw txError;
      } else {
        // Single transaction
        const { error } = await supabase.from("transactions").insert({
          user_id: userId,
          account_id: accountId,
          category_id: categoryId || null,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          status,
          source: description.trim(),
          payment_method: paymentMethod,
          notes: null,
        });
        if (error) throw error;
      }

      // Update account balance
      const account = accounts.find((a: any) => a.id === accountId);
      if (account && status === "paid") {
        const balanceChange = type === "income" ? numAmount : -numAmount;
        await supabase
          .from("accounts")
          .update({ current_balance: (account.current_balance || 0) + balanceChange })
          .eq("id", accountId);
      }

      toast.success(
        mode === "installment"
          ? `${installmentCount} parcelas registradas!`
          : mode === "recurrence"
          ? "Transação recorrente criada!"
          : "Transação registrada!"
      );

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
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
    setCardId("");
    setMode("single");
    setInstallments("2");
    setRecurrenceDuration("0");
    setStatus("paid");
    setTransactionDate(new Date().toISOString().split("T")[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="font-heading text-lg">Nova transação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5 max-h-[75vh] overflow-y-auto">
          {/* ── 1. Type toggle ── */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              className={cn("gap-2 h-11", type === "expense" && "gradient-primary text-primary-foreground")}
              onClick={() => setType("expense")}
            >
              <ArrowDownCircle className="h-4 w-4" /> Despesa
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              className={cn("gap-2 h-11", type === "income" && "bg-success text-success-foreground hover:bg-success/90")}
              onClick={() => setType("income")}
            >
              <ArrowUpCircle className="h-4 w-4" /> Receita
            </Button>
          </div>

          {/* ── 2. Amount ── */}
          <div>
            <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-14 text-2xl font-bold text-center border-2 focus:border-primary"
              autoFocus
            />
          </div>

          {/* ── 3. Description ── */}
          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Input
              placeholder="Ex: Mercado, Salário, Netflix..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* ── 4. Payment method ── */}
          {type === "expense" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Como pagou?</Label>
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
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {pm.icon}
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 5. Card selection ── */}
          {type === "expense" && needsCard && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Qual cartão?</Label>
              {cards.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
                  Nenhum cartão cadastrado. Adicione em Meu Cartãozinho.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {cards.map((card: any) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setCardId(card.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all",
                        cardId === card.id
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <BankLogo brand={card.brand} size={28} />
                      <span className="truncate text-xs font-medium">{card.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 6. Category ── */}
          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cat.color || "#ccc" }}
                      />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── 7. Transaction mode ── */}
          {type === "expense" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Tipo de gasto</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-2.5 px-2 text-[11px] font-medium transition-all",
                      mode === m.value
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 8. Installment details ── */}
          {mode === "installment" && type === "expense" && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground">Número de parcelas</Label>
                <Input
                  type="number"
                  min="2"
                  max="48"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className="mt-1 h-10"
                />
              </div>
              {numAmount > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-background/80 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {installmentCount}x de
                  </span>
                  <span className="font-bold text-primary">
                    {formatCurrency(perInstallment)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 9. Recurrence details ── */}
          {mode === "recurrence" && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
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

          {/* ── 10. Date & Status ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "paid")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Save ── */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 gradient-primary text-primary-foreground font-semibold text-base"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : mode === "installment" ? (
              `Salvar ${installmentCount} parcelas`
            ) : mode === "recurrence" ? (
              "Criar recorrência"
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
