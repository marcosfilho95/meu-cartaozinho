import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/constants";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  PiggyBank,
  Plus,
  Shield,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import { AddGoalDialog } from "./AddGoalDialog";

interface GoalsSectionProps {
  userId: string;
  goals: any[];
  accounts: any[];
  totalBalance: number;
  monthBalance: number;
  onReload: () => void;
}

type GoalTx = {
  id: string;
  goal_id: string;
  amount: number;
  type: "deposit" | "withdraw";
  description: string | null;
  created_at: string;
};

export const GoalsSection: React.FC<GoalsSectionProps> = ({
  userId,
  goals,
  accounts,
  totalBalance,
  monthBalance,
  onReload,
}) => {
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [allocAmount, setAllocAmount] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [goalTxs, setGoalTxs] = useState<GoalTx[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);

  const totalReserved = useMemo(
    () => goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0),
    [goals]
  );
  const availableBalance = totalBalance - totalReserved;

  // Load transactions for expanded goal
  useEffect(() => {
    if (!expandedGoalId) { setGoalTxs([]); return; }
    const load = async () => {
      setLoadingTxs(true);
      try {
        const { data, error } = await (supabase as any)
          .from("goal_transactions")
          .select("*")
          .eq("goal_id", expandedGoalId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        setGoalTxs(data || []);
      } catch {
        setGoalTxs([]);
      } finally {
        setLoadingTxs(false);
      }
    };
    load();
  }, [expandedGoalId]);

  // Find primary account to deduct from
  const primaryAccount = useMemo(() => {
    return accounts.find((a: any) => a.type === "checking") || accounts[0] || null;
  }, [accounts]);

  const handleAllocate = async () => {
    const amount = parseFloat(allocAmount.replace(",", "."));
    if (!amount || amount <= 0) { toast.error("Informe um valor válido."); return; }
    if (!selectedGoalId) { toast.error("Selecione uma meta."); return; }
    if (!primaryAccount) { toast.error("Nenhuma conta disponível para debitar."); return; }
    if (amount > Math.max(availableBalance, 0)) {
      toast.error("Saldo disponível insuficiente.");
      return;
    }

    setSaving(true);
    try {
      const goal = goals.find((g) => g.id === selectedGoalId);
      if (!goal) throw new Error("Meta não encontrada");

      // Update goal current_amount
      const { error: gErr } = await supabase
        .from("goals")
        .update({ current_amount: Number(goal.current_amount || 0) + amount })
        .eq("id", selectedGoalId);
      if (gErr) throw gErr;

      // Deduct from primary account
      const { error: aErr } = await supabase
        .from("accounts")
        .update({ current_balance: Number(primaryAccount.current_balance || 0) - amount })
        .eq("id", primaryAccount.id);
      if (aErr) throw aErr;

      // Record in goal_transactions
      const { error: tErr } = await (supabase as any)
        .from("goal_transactions")
        .insert({
          user_id: userId,
          goal_id: selectedGoalId,
          amount,
          type: "deposit",
          description: `Reserva de ${primaryAccount.name}`,
        });
      if (tErr) throw tErr;

      toast.success(`💰 ${formatCurrency(amount)} reservado para "${goal.name}"!`);
      setAllocAmount("");
      setSelectedGoalId("");
      onReload();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao reservar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    if (!window.confirm(`Excluir meta "${goal.name}"? O valor reservado voltará ao saldo disponível.`)) return;

    setDeletingId(goalId);
    try {
      const { error } = await supabase.from("goals").delete().eq("id", goalId);
      if (error) throw error;
      toast.success("Meta excluída.");
      if (expandedGoalId === goalId) setExpandedGoalId(null);
      onReload();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  };

  const handleWithdraw = async (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal || Number(goal.current_amount) <= 0) return;

    const input = window.prompt(`Quanto deseja retirar de "${goal.name}"? (Disponível: ${formatCurrency(Number(goal.current_amount))})`);
    if (!input) return;
    const amount = parseFloat(input.replace(",", "."));
    if (!amount || amount <= 0 || amount > Number(goal.current_amount)) {
      toast.error("Valor inválido.");
      return;
    }

    try {
      const { error: gErr } = await supabase
        .from("goals")
        .update({ current_amount: Number(goal.current_amount) - amount })
        .eq("id", goalId);
      if (gErr) throw gErr;

      await (supabase as any)
        .from("goal_transactions")
        .insert({
          user_id: userId,
          goal_id: goalId,
          amount,
          type: "withdraw",
          description: "Retirada manual",
        });

      toast.success(`${formatCurrency(amount)} retirado de "${goal.name}".`);
      onReload();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao retirar");
    }
  };

  return (
    <section className="space-y-4">
      {/* Balance overview */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-0 shadow-card bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-success" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Disponível
              </p>
            </div>
            <p className={cn("font-heading text-2xl font-extrabold", availableBalance >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(availableBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Livre para usar</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Reservado
              </p>
            </div>
            <p className="font-heading text-2xl font-extrabold text-primary">
              {formatCurrency(totalReserved)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{goals.length} meta{goals.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-foreground/60" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Total geral
              </p>
            </div>
            <p className="font-heading text-2xl font-extrabold text-foreground">
              {formatCurrency(totalBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Disponível + Reservado</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick allocate */}
      <Card className="border-0 shadow-elevated overflow-hidden">
        <div className="gradient-primary px-4 py-3">
          <h2 className="font-heading text-base font-bold text-primary-foreground flex items-center gap-2">
            <PiggyBank className="h-5 w-5" /> Guardar dinheiro
          </h2>
        </div>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">Quanto guardar?</p>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                className="h-12 text-xl font-bold text-center border-2 focus:border-primary"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">Para qual meta?</p>
              <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione a meta" />
                </SelectTrigger>
                <SelectContent>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 text-primary" />
                        {g.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full h-12 gradient-primary text-primary-foreground font-semibold text-sm gap-2"
                onClick={handleAllocate}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
                Guardar dinheiro
              </Button>
            </div>
          </div>
          {availableBalance > 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Saldo disponível para reservar: <span className="font-bold text-success">{formatCurrency(availableBalance)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Goals list */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-bold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Minhas metas
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl text-xs"
          onClick={() => setGoalDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Nova meta
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-8 text-center">
            <PiggyBank className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma meta criada ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Crie metas para guardar dinheiro com propósito.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setGoalDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const current = Number(goal.current_amount || 0);
            const target = Number(goal.target_amount || 1);
            const progress = Math.min((current / target) * 100, 100);
            const isCompleted = progress >= 100;
            const isExpanded = expandedGoalId === goal.id;

            return (
              <Card
                key={goal.id}
                className={cn(
                  "border-0 shadow-card overflow-hidden transition-all",
                  isCompleted && "ring-2 ring-success/30"
                )}
              >
                <CardContent className="p-0">
                  {/* Goal header */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading text-base font-bold truncate">{goal.name}</h3>
                          {isCompleted && (
                            <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
                              Concluída!
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {goal.deadline
                            ? `Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`
                            : "Sem prazo definido"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(goal.id)}
                          disabled={deletingId === goal.id}
                        >
                          {deletingId === goal.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex items-end justify-between mb-1.5">
                        <span className="font-heading text-xl font-extrabold text-primary">
                          {formatCurrency(current)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          de {formatCurrency(target)}
                        </span>
                      </div>
                      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700 ease-out",
                            isCompleted
                              ? "bg-gradient-to-r from-success to-success/80"
                              : "bg-gradient-to-r from-primary to-primary/80"
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] font-bold text-primary">{progress.toFixed(0)}%</span>
                        <span className="text-[11px] text-muted-foreground">
                          Falta {formatCurrency(Math.max(target - current, 0))}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {!isCompleted && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 rounded-xl gradient-primary text-primary-foreground text-xs h-9"
                          onClick={() => {
                            setSelectedGoalId(goal.id);
                            // scroll to allocate section
                            document.querySelector('[data-allocate]')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" /> Guardar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-xl text-xs h-9"
                          onClick={() => handleWithdraw(goal.id)}
                          disabled={current <= 0}
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" /> Retirar
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Expanded history */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                        Histórico de movimentações
                      </p>
                      {loadingTxs ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : goalTxs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Nenhuma movimentação ainda.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {goalTxs.map((tx) => (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between rounded-lg bg-background px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full",
                                    tx.type === "deposit"
                                      ? "bg-success/15 text-success"
                                      : "bg-destructive/15 text-destructive"
                                  )}
                                >
                                  {tx.type === "deposit" ? (
                                    <ArrowUpRight className="h-3 w-3" />
                                  ) : (
                                    <ArrowDownLeft className="h-3 w-3" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-medium">
                                    {tx.description || (tx.type === "deposit" ? "Depósito" : "Retirada")}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(tx.created_at).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <p
                                className={cn(
                                  "text-sm font-bold",
                                  tx.type === "deposit" ? "text-success" : "text-destructive"
                                )}
                              >
                                {tx.type === "deposit" ? "+" : "-"}
                                {formatCurrency(Number(tx.amount))}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddGoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        userId={userId}
        onCreated={onReload}
      />
    </section>
  );
};
