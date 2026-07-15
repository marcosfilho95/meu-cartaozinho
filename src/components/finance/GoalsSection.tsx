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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/constants";
import { getGoalMonthlyRequirement, type PlanningGoal } from "@/lib/financePlanning";
import { getErrorMessage } from "@/lib/supabaseUntyped";
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

type GoalItem = PlanningGoal & { id: string; goal_type?: string; priority?: number };
type GoalAccount = {
  id: string;
  name: string;
  type: string;
  current_balance?: number | null;
};

interface GoalsSectionProps {
  userId: string;
  goals: GoalItem[];
  accounts: GoalAccount[];
  monthlySurplus: number;
  allocatedThisMonth: number;
  refMonth: string;
  onReload: () => void;
}

type GoalTx = {
  id: string;
  goal_id: string;
  amount: number;
  type: "deposit" | "withdraw";
  description: string | null;
  created_at: string;
  ref_month?: string | null;
};

export const GoalsSection: React.FC<GoalsSectionProps> = ({
  userId,
  goals,
  accounts,
  monthlySurplus,
  allocatedThisMonth,
  refMonth,
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
  const [goalToDelete, setGoalToDelete] = useState<GoalItem | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<GoalItem | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const totalReserved = useMemo(
    () => goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0),
    [goals],
  );
  const visibleGoals = useMemo(
    () => goals.filter((goal) => !goal.is_completed || Number(goal.current_amount || 0) > 0),
    [goals],
  );
  const totalTargets = useMemo(
    () => goals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0),
    [goals],
  );

  useEffect(() => {
    if (!expandedGoalId) {
      setGoalTxs([]);
      return;
    }

    const load = async () => {
      setLoadingTxs(true);
      try {
        const { data, error } = await supabase
          .from("goal_transactions")
          .select("*")
          .eq("goal_id", expandedGoalId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        setGoalTxs((data || []) as GoalTx[]);
      } catch {
        setGoalTxs([]);
      } finally {
        setLoadingTxs(false);
      }
    };

    load();
  }, [expandedGoalId]);

  const primaryAccount = useMemo(() => {
    const liquidAccounts = accounts
      .filter((account) => ["checking", "savings", "cash"].includes(account.type))
      .sort((left, right) => Number(right.current_balance || 0) - Number(left.current_balance || 0));
    return liquidAccounts[0] || null;
  }, [accounts]);
  const availableFromClosing = Math.max(monthlySurplus - allocatedThisMonth, 0);
  const availableInAccount = Math.max(Number(primaryAccount?.current_balance || 0), 0);
  const availableBalance = Math.min(availableFromClosing, availableInAccount);
  const totalProgress = totalTargets > 0 ? Math.min((totalReserved / totalTargets) * 100, 100) : 0;
  const referenceLabel = new Date(`${refMonth}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const isMissingPlanningRpc = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (error.code === "PGRST202" || /function|schema cache|reserve_goal_funds|withdraw_goal_funds|delete_goal/i.test(error.message || "")));

  const handleAllocate = async () => {
    const amount = parseFloat(allocAmount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!selectedGoalId) {
      toast.error("Selecione uma meta.");
      return;
    }
    if (!primaryAccount) {
      toast.error("Nenhuma conta disponível para debitar.");
      return;
    }
    if (amount > Math.max(availableBalance, 0)) {
      toast.error("Saldo disponível insuficiente.");
      return;
    }

    setSaving(true);
    try {
      const goal = goals.find((g) => g.id === selectedGoalId);
      if (!goal) throw new Error("Meta não encontrada.");
      const remaining = Math.max(Number(goal.target_amount) - Number(goal.current_amount), 0);
      if (amount > remaining) throw new Error(`Faltam ${formatCurrency(remaining)} para concluir esta meta.`);

      const rpcResult = await supabase.rpc("reserve_goal_funds", {
        p_goal_id: selectedGoalId,
        p_account_id: primaryAccount.id,
        p_amount: amount,
        p_ref_month: refMonth,
        p_description: `Reserva do fechamento de ${referenceLabel}`,
      });
      if (rpcResult.error && !isMissingPlanningRpc(rpcResult.error)) throw rpcResult.error;

      if (rpcResult.error) {
        const { error: gErr } = await supabase
          .from("goals")
          .update({
            current_amount: Number(goal.current_amount || 0) + amount,
            is_completed: Number(goal.current_amount || 0) + amount >= Number(goal.target_amount),
          })
          .eq("id", selectedGoalId);
        if (gErr) throw gErr;
        const { error: aErr } = await supabase
          .from("accounts")
          .update({ current_balance: Number(primaryAccount.current_balance || 0) - amount })
          .eq("id", primaryAccount.id);
        if (aErr) throw aErr;
        let { error: tErr } = await supabase.from("goal_transactions").insert({
          user_id: userId,
          goal_id: selectedGoalId,
          account_id: primaryAccount.id,
          amount,
          type: "deposit",
          description: `Reserva do fechamento de ${referenceLabel}`,
          ref_month: refMonth,
        });
        if (tErr && /account_id|ref_month/i.test(tErr.message)) {
          const fallback = await supabase.from("goal_transactions").insert({
            user_id: userId,
            goal_id: selectedGoalId,
            amount,
            type: "deposit",
            description: `Reserva do fechamento de ${referenceLabel}`,
          });
          tErr = fallback.error;
        }
        if (tErr) throw tErr;
      }

      toast.success(`${formatCurrency(amount)} reservado para "${goal.name}".`);
      setAllocAmount("");
      setSelectedGoalId("");
      onReload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao reservar."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteGoal = async () => {
    if (!goalToDelete) return;

    setDeletingId(goalToDelete.id);
    try {
      if (!primaryAccount) throw new Error("Nenhuma conta disponível para receber o valor guardado.");
      const rpcResult = await supabase.rpc("delete_goal_and_release_funds", {
        p_goal_id: goalToDelete.id,
        p_account_id: primaryAccount.id,
      });
      if (rpcResult.error && !isMissingPlanningRpc(rpcResult.error)) throw rpcResult.error;
      if (rpcResult.error) {
        const released = Number(goalToDelete.current_amount || 0);
        if (released > 0) {
          const { error: accountError } = await supabase
            .from("accounts")
            .update({ current_balance: Number(primaryAccount.current_balance || 0) + released })
            .eq("id", primaryAccount.id);
          if (accountError) throw accountError;
        }
        const { error } = await supabase.from("goals").delete().eq("id", goalToDelete.id);
        if (error) throw error;
      }
      toast.success("Cofrinho excluído e valor devolvido para a conta.");
      if (expandedGoalId === goalToDelete.id) setExpandedGoalId(null);
      setGoalToDelete(null);
      onReload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao excluir cofrinho."));
    } finally {
      setDeletingId(null);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawGoal) return;

    const amount = parseFloat(withdrawAmount.replace(",", "."));
    if (!amount || amount <= 0 || amount > Number(withdrawGoal.current_amount)) {
      toast.error("Valor inválido.");
      return;
    }

    setWithdrawing(true);
    try {
      if (!primaryAccount) throw new Error("Nenhuma conta disponível para receber a retirada.");
      const rpcResult = await supabase.rpc("withdraw_goal_funds", {
        p_goal_id: withdrawGoal.id,
        p_account_id: primaryAccount.id,
        p_amount: amount,
        p_ref_month: refMonth,
        p_description: `Retirada para ${primaryAccount.name}`,
      });
      if (rpcResult.error && !isMissingPlanningRpc(rpcResult.error)) throw rpcResult.error;
      if (rpcResult.error) {
        const { error: gErr } = await supabase
          .from("goals")
          .update({ current_amount: Number(withdrawGoal.current_amount) - amount, is_completed: false })
          .eq("id", withdrawGoal.id);
        if (gErr) throw gErr;
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ current_balance: Number(primaryAccount.current_balance || 0) + amount })
          .eq("id", primaryAccount.id);
        if (accountError) throw accountError;
        let { error: txError } = await supabase.from("goal_transactions").insert({
          user_id: userId,
          goal_id: withdrawGoal.id,
          account_id: primaryAccount.id,
          amount,
          type: "withdraw",
          description: `Retirada para ${primaryAccount.name}`,
          ref_month: refMonth,
        });
        if (txError && /account_id|ref_month/i.test(txError.message)) {
          const fallback = await supabase.from("goal_transactions").insert({
            user_id: userId,
            goal_id: withdrawGoal.id,
            amount,
            type: "withdraw",
            description: `Retirada para ${primaryAccount.name}`,
          });
          txError = fallback.error;
        }
        if (txError) throw txError;
      }

      toast.success(`${formatCurrency(amount)} retirado de "${withdrawGoal.name}".`);
      setWithdrawGoal(null);
      setWithdrawAmount("");
      onReload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao retirar."));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-0 shadow-card bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-success" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Disponível do fechamento
              </p>
            </div>
            <p
              className={cn(
                "font-heading text-2xl font-extrabold",
                availableBalance >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {formatCurrency(availableBalance)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Sobra de {referenceLabel} ainda não reservada
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Guardado nos cofrinhos
              </p>
            </div>
            <p className="font-heading text-2xl font-extrabold text-primary">{formatCurrency(totalReserved)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {visibleGoals.length} meta{visibleGoals.length !== 1 ? "s" : ""} ativa{visibleGoals.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Shield className="h-4 w-4 text-foreground/60" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Progresso dos sonhos
              </p>
            </div>
            <p className="font-heading text-2xl font-extrabold text-foreground">{totalProgress.toFixed(0)}%</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {formatCurrency(totalReserved)} de {formatCurrency(totalTargets)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-0 shadow-elevated" data-allocate>
        <div className="gradient-primary px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-primary-foreground">
            <PiggyBank className="h-5 w-5" /> Distribuir a sobra de {referenceLabel}
          </h2>
        </div>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Quanto reservar?</p>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                className="h-11 border-2 text-center text-lg font-bold focus:border-primary"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Para qual meta?</p>
              <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                <SelectTrigger className="h-11">
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
                className="gradient-primary h-11 w-full gap-2 text-sm font-semibold text-primary-foreground"
                onClick={handleAllocate}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
                Reservar agora
              </Button>
            </div>
          </div>
          {availableBalance > 0 && (
            <p className="text-center text-[11px] text-muted-foreground">
              Capacidade restante deste fechamento: <span className="font-bold text-success">{formatCurrency(availableBalance)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
          <Target className="h-4 w-4 text-primary" /> Meus cofrinhos
        </h2>
        <Button
          size="sm"
          className="gradient-primary h-9 gap-1.5 rounded-xl border border-primary/30 px-3 text-xs font-bold text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
          onClick={() => setGoalDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Novo cofrinho
        </Button>
      </div>

      {visibleGoals.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-8 text-center">
            <PiggyBank className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum cofrinho criado ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Crie um objetivo para transformar sua sobra mensal em um plano.</p>
            <Button
              size="sm"
              className="gradient-primary mt-4 gap-1.5 border border-primary/30 text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
              onClick={() => setGoalDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeiro cofrinho
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleGoals.map((goal) => {
            const current = Number(goal.current_amount || 0);
            const target = Number(goal.target_amount || 1);
            const progress = Math.min((current / target) * 100, 100);
            const isCompleted = progress >= 100;
            const isExpanded = expandedGoalId === goal.id;
            const monthlyRequirement = getGoalMonthlyRequirement(goal, refMonth);

            return (
              <Card
                key={goal.id}
                className={cn("overflow-hidden border-0 shadow-card transition-all", isCompleted && "ring-2 ring-success/30")}
              >
                <CardContent className="p-0">
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-heading text-base font-bold">{goal.name}</h3>
                          {isCompleted && (
                            <Badge className="border-success/30 bg-success/15 text-[10px] text-success">Concluída</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {goal.deadline
                            ? `Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`
                            : "Sem prazo definido"}
                        </p>
                        {monthlyRequirement > 0 && !isCompleted && (
                          <p className="mt-0.5 text-[11px] font-semibold text-primary">
                            Ritmo sugerido: {formatCurrency(monthlyRequirement)}/mês
                          </p>
                        )}
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
                          onClick={() => setGoalToDelete(goal)}
                          disabled={deletingId === goal.id}
                        >
                          {deletingId === goal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-end justify-between">
                        <span className="font-heading text-xl font-extrabold text-primary">{formatCurrency(current)}</span>
                        <span className="text-xs text-muted-foreground">de {formatCurrency(target)}</span>
                      </div>
                      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700 ease-out",
                            isCompleted ? "bg-gradient-to-r from-success to-success/80" : "bg-gradient-to-r from-primary to-primary/80",
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-primary">{progress.toFixed(0)}%</span>
                        <span className="text-[11px] text-muted-foreground">
                          Falta {formatCurrency(Math.max(target - current, 0))}
                        </span>
                      </div>
                    </div>

                    {!isCompleted && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="gradient-primary h-9 flex-1 gap-1.5 rounded-xl text-xs text-primary-foreground"
                          onClick={() => {
                            setSelectedGoalId(goal.id);
                            document.querySelector("[data-allocate]")?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" /> Reservar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl text-xs"
                          onClick={() => {
                            setWithdrawGoal(goal);
                            setWithdrawAmount("");
                          }}
                          disabled={current <= 0}
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" /> Retirar
                        </Button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 p-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Histórico de movimentações
                      </p>
                      {loadingTxs ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : goalTxs.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">Nenhuma movimentação ainda.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {goalTxs.map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full",
                                    tx.type === "deposit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                                  )}
                                >
                                  {tx.type === "deposit" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                                </div>
                                <div>
                                  <p className="text-xs font-medium">{tx.description || (tx.type === "deposit" ? "Depósito" : "Retirada")}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(tx.created_at).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <p className={cn("text-sm font-bold", tx.type === "deposit" ? "text-success" : "text-destructive")}>
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

      <AddGoalDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} userId={userId} onCreated={onReload} />

      <AlertDialog open={!!goalToDelete} onOpenChange={(open) => !open && setGoalToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao excluir a meta <strong>{goalToDelete?.name}</strong>, o valor reservado volta para o saldo disponível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteGoal}>
              Excluir meta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!withdrawGoal} onOpenChange={(open) => !open && setWithdrawGoal(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Retirar da meta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Meta: <strong className="text-foreground">{withdrawGoal?.name}</strong>
            </p>
            <p className="text-xs text-muted-foreground">Disponível: {formatCurrency(Number(withdrawGoal?.current_amount || 0))}</p>
            <div>
              <Label className="text-xs text-muted-foreground">Valor a retirar</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setWithdrawGoal(null)}>
                Cancelar
              </Button>
              <Button className="gradient-primary flex-1 text-primary-foreground" onClick={handleWithdraw} disabled={withdrawing}>
                {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};
