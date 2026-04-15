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
  Layers,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/constants";
import { BankLogo } from "@/components/BankLogo";

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

const BANK_OPTIONS = [
  { brand: "nubank", label: "Nubank" },
  { brand: "bradesco", label: "Bradesco" },
  { brand: "bb", label: "Banco do Brasil" },
  { brand: "c6", label: "C6" },
  { brand: "inter", label: "Inter" },
  { brand: "santander", label: "Santander" },
  { brand: "itau", label: "Itaú" },
  { brand: "caixa", label: "Caixa" },
  { brand: "picpay", label: "PicPay" },
  { brand: "mercadopago", label: "Mercado Pago" },
] as const;

const BANK_COLORS: Record<string, string> = {
  nubank: "#8A05BE",
  "mercado pago": "#009EE3",
  mercadopago: "#009EE3",
  picpay: "#21C25E",
  itau: "#EC7000",
  "banco do brasil": "#F7C400",
  bb: "#F7C400",
  bradesco: "#CC092F",
  santander: "#EC0000",
  caixa: "#005CA8",
  c6: "#111111",
  inter: "#FF7A00",
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const BANK_LABEL_BY_BRAND: Record<string, string> = BANK_OPTIONS.reduce((acc, item) => {
  acc[normalize(item.brand)] = item.label;
  return acc;
}, {} as Record<string, string>);

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
}) => {
  const queryClient = useQueryClient();

  const [type, setType] = useState<TxType>(defaultType);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => (localStorage.getItem(LAST_PAYMENT_KEY) as PaymentMethod) || "pix",
  );
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<TxMode>("single");
  const [installments, setInstallments] = useState("1");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>("monthly");
  const [recurrenceDuration, setRecurrenceDuration] = useState("0");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => toDateInput(new Date()));
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [accs, cardsRes, cats] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, due_day, current_balance")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("cards")
          .select("id, name, brand, color, default_due_day")
          .eq("user_id", userId)
          .order("name"),
        supabase
          .from("categories")
          .select("id, name, kind, color, icon, parent_id")
          .eq("user_id", userId)
          .order("name"),
      ]);
      setAccounts(accs.data || []);
      setCards(cardsRes.data || []);
      setCategories(cats.data || []);
    };
    load();
  }, [open, userId]);

  useEffect(() => {
    setCategoryId("");
    if (type === "income" && mode === "installment") {
      setMode("single");
    }
  }, [type, mode]);

  const filteredCategories = useMemo(
    () => categories.filter((c: any) => c.kind === type && !isGenericCardCategory(c.name)),
    [categories, type],
  );

  const needsCard = type === "expense" && (paymentMethod === "credit" || paymentMethod === "debit");

  const cardOptions = useMemo(() => {
    const real = (cards || []).map((card: any) => ({
      value: card.id,
      label: String(card.name || "Cartão"),
      brand: String(card.brand || ""),
      defaultDueDay: Number(card.default_due_day || 0) || null,
      isVirtual: false,
    }));

    const hasByBrand = new Set(real.map((item) => normalize(item.brand)));
    const virtual = BANK_OPTIONS.filter((bank) => !hasByBrand.has(normalize(bank.brand))).map((bank) => ({
      value: `virtual:${bank.brand}`,
      label: bank.label,
      brand: bank.brand,
      defaultDueDay: null,
      isVirtual: true,
    }));

    return [...real, ...virtual];
  }, [cards]);

  const selectedCardMeta = useMemo(() => {
    return cardOptions.find((item) => item.value === cardId) || null;
  }, [cardOptions, cardId]);

  const selectedCardCategoryLabel = useMemo(() => {
    if (!selectedCardMeta) return "";
    const byBrand = BANK_LABEL_BY_BRAND[normalize(selectedCardMeta.brand || "")];
    return byBrand || selectedCardMeta.label;
  }, [selectedCardMeta]);

  useEffect(() => {
    if (!needsCard || !cardId) return;
    const dueDay = Number(selectedCardMeta?.defaultDueDay || 0);
    if (dueDay > 0) setTransactionDate(getNextDueDate(dueDay));
  }, [needsCard, cardId, selectedCardMeta]);

  const resolveAccountId = useCallback((): string | null => {
    if (needsCard) {
      if (selectedCardMeta?.label) {
        const cardName = String(selectedCardMeta.label).toLowerCase();
        const byName = accounts.find((a: any) => {
          const accountName = String(a.name || "").toLowerCase();
          return (
            accountName === cardName ||
            accountName.includes(cardName) ||
            cardName.includes(accountName)
          );
        });
        if (byName?.id) return byName.id;
      }
      if (selectedCardMeta?.brand) {
        const brandKey = normalize(selectedCardMeta.brand);
        const byInstitution = accounts.find((a: any) => normalize(String(a.institution || "")).includes(brandKey));
        if (byInstitution?.id) return byInstitution.id;
      }
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
  }, [accounts, paymentMethod, needsCard, selectedCardMeta]);

  const numAmount = parseFloat(amount.replace(",", ".")) || 0;
  const installmentCount = Math.max(1, parseInt(installments, 10) || 1);
  const perInstallment = mode === "installment" && numAmount > 0 ? numAmount : 0;
  const projectedTotal = mode === "installment" && numAmount > 0 ? numAmount * installmentCount : 0;

  const resolveCategoryIdForSave = useCallback(async () => {
    if (!(type === "expense" && needsCard && selectedCardMeta)) {
      return categoryId || null;
    }

    const targetName = selectedCardCategoryLabel || selectedCardMeta.label;
    const normalizedTarget = normalize(targetName);
    const expenseCategories = categories.filter((c: any) => c.kind === "expense");

    const existing = expenseCategories.find((cat: any) => normalize(String(cat.name || "")) === normalizedTarget);
    if (existing?.id) return existing.id as string;

    const cardsParent =
      expenseCategories.find((cat: any) => !cat.parent_id && normalize(String(cat.name || "")) === "cartoes") ||
      expenseCategories.find((cat: any) => !cat.parent_id && normalize(String(cat.name || "")) === "cartão");

    let parentId = cardsParent?.id || null;
    if (!parentId) {
      const { data: parentInsert, error: parentError } = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: "Cartões",
          kind: "expense",
          color: "#6366F1",
          icon: "credit-card",
          is_system: true,
          parent_id: null,
        })
        .select("id")
        .single();
      if (parentError) throw parentError;
      parentId = parentInsert.id;
    }

    const brandColor =
      BANK_COLORS[normalize(selectedCardMeta.brand || "")] ||
      BANK_COLORS[normalize(targetName)] ||
      "#7C3AED";

    const { data: childInsert, error: childError } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        name: targetName,
        kind: "expense",
        color: brandColor,
        icon: "credit-card",
        is_system: true,
        parent_id: parentId,
      })
      .select("id")
      .single();
    if (childError) throw childError;

    setCategories((prev) => [
      ...prev,
      {
        id: childInsert.id,
        name: targetName,
        kind: "expense",
        color: brandColor,
        icon: "credit-card",
        parent_id: parentId,
      },
    ]);
    setCategoryId(childInsert.id);
    return childInsert.id as string;
  }, [type, needsCard, selectedCardMeta, selectedCardCategoryLabel, categoryId, categories, userId]);

  const handleSave = async () => {
    if (!numAmount || numAmount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    if (needsCard && !cardId) {
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
      const resolvedCategoryId = await resolveCategoryIdForSave();
      if (mode === "installment" && type === "expense") {
        const rows = [];
        for (let i = 0; i < installmentCount; i += 1) {
          const amountForRow = Math.round(numAmount * 100) / 100;

          const due = new Date(`${transactionDate}T12:00:00`);
          due.setMonth(due.getMonth() + i);
          const dueStr = toDateInput(due);

          rows.push({
            user_id: userId,
            account_id: accountId,
            category_id: resolvedCategoryId,
            type,
            amount: amountForRow,
            transaction_date: dueStr,
            due_date: dueStr,
            status: i === 0 ? status : "pending",
            source: `${description.trim()} (${i + 1}/${installmentCount})`,
            payment_method: paymentMethod,
            notes: null,
          });
        }
        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw error;
      } else if (mode === "recurrence") {
        const { error: recError } = await supabase.from("recurrences").insert({
          user_id: userId,
          frequency: recurrenceFreq,
          auto_create: true,
          is_active: true,
          next_date: transactionDate,
          template_payload: {
            account_id: accountId,
            category_id: resolvedCategoryId,
            type,
            amount: numAmount,
            source: description.trim(),
            payment_method: paymentMethod,
            due_date: transactionDate,
          },
        });
        if (recError) throw recError;

        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          account_id: accountId,
          category_id: resolvedCategoryId,
          type,
          amount: numAmount,
          transaction_date: transactionDate,
          due_date: transactionDate,
          status,
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
          due_date: transactionDate,
          status,
          source: description.trim(),
          payment_method: paymentMethod,
          notes: null,
        });
        if (error) throw error;
      }

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
            : "Transação registrada!",
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
    setInstallments("1");
    setRecurrenceDuration("0");
    setStatus("pending");
    setTransactionDate(toDateInput(new Date()));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden rounded-2xl p-0">
        <DialogHeader className="px-5 pb-2 pt-5">
          <DialogTitle className="font-heading text-lg">Nova transação</DialogTitle>
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

          {type === "expense" && needsCard && (
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Cartão</Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o banco/cartão" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {cardOptions.map((card) => (
                    <SelectItem key={card.value} value={card.value}>
                      <span className="flex items-center gap-2">
                        <BankLogo brand={card.brand} size={20} />
                        <span className="truncate">{card.label}</span>
                        {card.isVirtual && <span className="text-[10px] text-muted-foreground">• banco</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            {needsCard ? (
              selectedCardMeta ? (
              <div className="mt-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-foreground">
                {selectedCardCategoryLabel || selectedCardMeta.label} (automática)
              </div>
              ) : (
                <div className="mt-1 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm text-muted-foreground">
                  Selecione o banco/cartão para definir a categoria automaticamente.
                </div>
              )
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
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
            )}
          </div>

          <div>
            <Label className="mb-2 block text-xs text-muted-foreground">
              {type === "income" ? "Tipo de receita" : "Tipo de gasto"}
            </Label>
            <div className={cn("grid gap-1.5", type === "income" ? "grid-cols-2" : "grid-cols-3")}>
              {MODE_OPTIONS
                .filter((m) => type === "expense" || m.value !== "installment")
                .map((m) => (
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
                    {m.value === "single" && type === "income"
                      ? "Variável"
                      : m.value === "recurrence" && type === "income"
                        ? "Fixo/Recorrente"
                        : m.label}
                  </button>
                ))}
            </div>
          </div>

          {mode === "installment" && type === "expense" && (
            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div>
                <Label className="text-xs text-muted-foreground">Número de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  max="48"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className="mt-1 h-10"
                />
              </div>
              {numAmount > 0 && (
                <div className="space-y-1 rounded-lg bg-background/80 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{installmentCount}x de</span>
                    <span className="font-bold text-primary">{formatCurrency(perInstallment)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total projetado</span>
                    <span className="font-semibold text-foreground">{formatCurrency(projectedTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

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
              <Label className="text-xs text-muted-foreground">Vencimento</Label>
              <Input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Use a data de vencimento da conta/fatura.</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "paid")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Só lançar (pendente)</SelectItem>
                  <SelectItem value="paid">Já pagou</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">Se ainda não foi pago, deixe como pendente.</p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="gradient-primary h-12 w-full text-base font-semibold text-primary-foreground"
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
