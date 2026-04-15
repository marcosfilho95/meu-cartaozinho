import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinanceLayout } from "@/components/finance/FinanceLayout";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Building2,
  PiggyBank,
  CreditCard,
  TrendingUp,
  HandCoins,
  Loader2,
  House,
  Car,
  UtensilsCrossed,
  HeartPulse,
  PartyPopper,
  Shield,
} from "lucide-react";
import { ACCOUNT_TYPE_LABELS, formatCurrency } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ensureDefaultAccounts } from "@/lib/financeDefaults";
import { getFinanceAccountsCache, setFinanceAccountsCache } from "@/lib/financePageCache";

const ICON_MAP: Record<string, React.ElementType> = {
  cash: Wallet,
  checking: Building2,
  savings: PiggyBank,
  credit_card: CreditCard,
  investment: TrendingUp,
  loan: HandCoins,
};

const ACCOUNT_NAME_ICON_MAP: Array<{ pattern: RegExp; icon: React.ElementType }> = [
  { pattern: /casa|moradia|aluguel/i, icon: House },
  { pattern: /transporte|carro|combust/i, icon: Car },
  { pattern: /aliment|mercado|delivery|restaurante/i, icon: UtensilsCrossed },
  { pattern: /saude|saúde|medic|farmac/i, icon: HeartPulse },
  { pattern: /lazer|viagem|entretenimento/i, icon: PartyPopper },
  { pattern: /reserva|emergencia|emergência/i, icon: Shield },
];

const getAccountIcon = (account: { name?: string; type?: string }) => {
  const byName = ACCOUNT_NAME_ICON_MAP.find((rule) => rule.pattern.test(String(account.name || "")))?.icon;
  if (byName) return byName;
  return ICON_MAP[String(account.type || "")] || Wallet;
};

interface AccountsPageProps {
  userId: string;
}

const AccountsPage: React.FC<AccountsPageProps> = ({ userId }) => {
  const queryClient = useQueryClient();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("checking");
  const [scope, setScope] = useState<string>("personal");
  const [institution, setInstitution] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  const loadAccounts = async () => {
    setLoading(accounts.length === 0);
    let { data } = await supabase.from("accounts").select("*").eq("user_id", userId).order("name");
    if (!data || data.length === 0) {
      try {
        const created = await ensureDefaultAccounts(userId);
        if (created) {
          const reload = await supabase.from("accounts").select("*").eq("user_id", userId).order("name");
          data = reload.data || [];
        }
      } catch {
        // Keep current behavior if default bootstrap fails.
      }
    }
    setAccounts(data || []);
    setFinanceAccountsCache(userId, data || []);
    setLoading(false);
  };

  useEffect(() => {
    const cached = getFinanceAccountsCache<any[]>(userId);
    if (cached && cached.length > 0) {
      setAccounts(cached);
      setLoading(false);
    }
    loadAccounts();
  }, [userId]);

  const totalBalance = accounts.reduce((sum, account) => sum + (account.include_in_net_worth ? Number(account.current_balance) : 0), 0);

  const openCreate = () => {
    setEditingAccount(null);
    setName("");
    setType("checking");
    setScope("personal");
    setInstitution("");
    setInitialBalance("");
    setClosingDay("");
    setDueDay("");
    setCreditLimit("");
    setDialogOpen(true);
  };

  const openEdit = (account: any) => {
    setEditingAccount(account);
    setName(account.name);
    setType(account.type);
    setScope(account.scope);
    setInstitution(account.institution || "");
    setInitialBalance(String(account.initial_balance || ""));
    setClosingDay(String(account.closing_day || ""));
    setDueDay(String(account.due_day || ""));
    setCreditLimit(String(account.credit_limit || ""));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da conta");
      return;
    }

    setSaving(true);
    const payload: any = {
      user_id: userId,
      name: name.trim(),
      type,
      scope,
      institution: institution.trim() || null,
      initial_balance: parseFloat(initialBalance.replace(",", ".")) || 0,
      closing_day: closingDay ? parseInt(closingDay, 10) : null,
      due_day: dueDay ? parseInt(dueDay, 10) : null,
      credit_limit: creditLimit ? parseFloat(creditLimit.replace(",", ".")) : null,
    };

    if (editingAccount) {
      const { error } = await supabase.from("accounts").update(payload).eq("id", editingAccount.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Conta atualizada!");
    } else {
      payload.current_balance = payload.initial_balance;
      const { error } = await supabase.from("accounts").insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Conta criada!");
    }

    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    setDialogOpen(false);
    setSaving(false);
    loadAccounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta conta? Todas as transações vinculadas serão removidas.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta excluída");
    loadAccounts();
  };

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 space-y-3">
        {loading && accounts.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : accounts.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Wallet className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhuma conta ainda</p>
              <p className="text-sm mt-1">Contas são bancos, carteira ou cartões onde seu dinheiro entra e sai.</p>
              <Button onClick={openCreate} className="mt-4 gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> Criar conta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {accounts.map((account) => {
              const Icon = getAccountIcon(account);
              return (
                <Card key={account.id} className="border-0 shadow-card transition-all hover:shadow-elevated">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{account.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                        {account.institution ? ` · ${account.institution}` : ""}
                      </p>
                    </div>
                    <p className={cn("text-sm font-bold shrink-0", Number(account.current_balance) >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(Number(account.current_balance))}
                    </p>
                    <div className="flex gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(account)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(account.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[680px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingAccount ? "Editar Conta" : "Nova Conta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Casa, Alimentação, Nubank..." className="mt-1" />
              <p className="mt-1 text-[11px] text-muted-foreground">Aqui você pode colocar: Casa, Alimentação, Transporte, Lazer, etc.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Escopo</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Pessoal</SelectItem>
                    <SelectItem value="business">Profissional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Instituição (opcional)</Label>
              <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Ex: Nubank, Itaú..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Saldo inicial (R$)</Label>
              <Input type="text" inputMode="decimal" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0,00" className="mt-1" />
            </div>
            {type === "credit_card" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Fechamento</Label>
                  <Input type="number" min={1} max={28} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} placeholder="Dia" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vencimento</Label>
                  <Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="Dia" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Limite</Label>
                  <Input type="text" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0,00" className="mt-1" />
                </div>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground font-semibold h-11">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : editingAccount ? "Salvar" : "Criar Conta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccountsPage;



