import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ensureDefaultCategories } from "@/lib/financeCategoryDefaults";

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  defaultType?: "income" | "expense";
}

export const AddTransactionDialog: React.FC<AddTransactionDialogProps> = ({
  open,
  onOpenChange,
  userId,
  defaultType = "expense",
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"income" | "expense">(defaultType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"pending" | "paid">("paid");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        await ensureDefaultCategories(userId);
      } catch {
        // non-blocking
      }
      const [accs, cats] = await Promise.all([
        supabase.from("accounts").select("id, name, type").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("categories").select("id, name, kind, color, icon").eq("user_id", userId).order("name"),
      ]);
      setAccounts(accs.data || []);
      setCategories(cats.data || []);
      if (accs.data?.length && !accountId) setAccountId(accs.data[0].id);
    };
    load();
  }, [open, userId]);

  const filteredCategories = categories.filter((category: any) => category.kind === type);
  const hasAccounts = accounts.length > 0;
  const hasTypeCategories = filteredCategories.length > 0;

  const handleSave = async () => {
    const numAmount = parseFloat(amount.replace(",", "."));
    if (!numAmount || numAmount <= 0) {
      toast.error("Informe um valor valido");
      return;
    }
    if (!accountId) {
      toast.error("Selecione uma conta");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descricao");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      account_id: accountId,
      category_id: categoryId || null,
      type,
      amount: numAmount,
      transaction_date: transactionDate,
      status,
      notes: notes.trim() || null,
      source: description.trim(),
    });

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }

    const account = accounts.find((item: any) => item.id === accountId);
    if (account) {
      const balanceChange = type === "income" ? numAmount : -numAmount;
      await supabase.from("accounts").update({
        current_balance: (account.current_balance || 0) + balanceChange,
      }).eq("id", accountId);
    }

    toast.success("Transacao registrada!");
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
    onOpenChange(false);
    resetForm();
    setSaving(false);
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setCategoryId("");
    setNotes("");
    setStatus("paid");
    setTransactionDate(new Date().toISOString().split("T")[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Nova Transacao</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={type === "expense" ? "default" : "outline"}
            className={cn("gap-2", type === "expense" && "gradient-primary text-primary-foreground")}
            onClick={() => setType("expense")}
          >
            <ArrowDownCircle className="h-4 w-4" /> Despesa
          </Button>
          <Button
            type="button"
            variant={type === "income" ? "default" : "outline"}
            className={cn("gap-2", type === "income" && "bg-success text-success-foreground hover:bg-success/90")}
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
            className="mt-1 h-14 text-2xl font-bold text-center border-2 focus:border-primary"
            autoFocus
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Descricao</Label>
          <Input
            placeholder="Ex: Mercado, Salario..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Conta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account: any) => (
                  <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasAccounts && (
              <div className="mt-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Nenhuma conta criada. Crie em {" "}
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/financas/contas");
                  }}
                  className="font-semibold text-primary underline"
                >
                  Contas
                </button>
                .
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((category: any) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasTypeCategories && (
              <div className="mt-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Nenhuma categoria de {type === "expense" ? "despesa" : "receita"}. Crie em {" "}
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/financas/categorias");
                  }}
                  className="font-semibold text-primary underline"
                >
                  Categorias
                </button>
                .
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <Select value={status} onValueChange={(value) => setStatus(value as "pending" | "paid")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Observacoes (opcional)</Label>
          <Textarea
            placeholder="Alguma nota..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 resize-none"
            rows={2}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !hasAccounts}
          className="w-full h-12 gradient-primary text-primary-foreground font-semibold text-base"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Salvar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
