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
import { monthTitle } from "@/lib/financeInsights";
import { type PlanningGoal } from "@/lib/financePlanning";
import { resolveFinancialRules, type FinancialRuleVersion } from "@/lib/financialRules";
import {
  calculateAvailableForContributions,
  calculateMonthlyGoalAchievement,
  calculateSuggestedContribution,
  type GoalContributionMovement,
} from "@/lib/goalContributions";
import {
  calculateContributionStats,
  calculateGoalTarget,
  getEffectiveAnnualRate,
  projectGoalCompletion,
  resolveGoalProjectionVersions,
  type GoalProjectionVersion,
  type ReferenceRate,
} from "@/lib/goalProjections";
import { getErrorMessage } from "@/lib/supabaseUntyped";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Settings2,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import { AddGoalDialog } from "./AddGoalDialog";
import { GoalAllocationChart } from "./GoalAllocationChart";
import { GoalProjectionDialog } from "./GoalProjectionDialog";
import { getGoalIcon, sortGoalsByAllocationPercentage } from "./goalVisuals";

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
  monthlyIncome: number;
  allocatedThisMonth: number;
  realizedByGoal: Record<string, number>;
  goalMovements: GoalContributionMovement[];
  projectionVersions: GoalProjectionVersion[];
  referenceRates: ReferenceRate[];
  averageMonthlyExpenses: number;
  refMonth: string;
  financialRules?: FinancialRuleVersion[];
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
  monthlyIncome,
  allocatedThisMonth,
  realizedByGoal,
  goalMovements,
  projectionVersions,
  referenceRates,
  averageMonthlyExpenses,
  refMonth,
  financialRules = [],
  onReload,
}) => {
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);
  const [allocAmount, setAllocAmount] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [projectionGoal, setProjectionGoal] = useState<GoalItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [goalTxs, setGoalTxs] = useState<GoalTx[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<GoalItem | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<GoalItem | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [editingTx, setEditingTx] = useState<GoalTx | null>(null);
  const [editTxAmount, setEditTxAmount] = useState("");
  const [editTxMonth, setEditTxMonth] = useState("");
  const [editTxDescription, setEditTxDescription] = useState("");
  const [savingTx, setSavingTx] = useState(false);
  const [txToDelete, setTxToDelete] = useState<GoalTx | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  const totalReserved = useMemo(
    () => goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0),
    [goals],
  );
  const visibleGoals = useMemo(
    () => goals.filter((goal) => !goal.is_completed || Number(goal.current_amount || 0) > 0),
    [goals],
  );
  const activeFinancialRules = useMemo(
    () => resolveFinancialRules(financialRules, refMonth),
    [financialRules, refMonth],
  );
  const activeProjectionVersions = useMemo(
    () => resolveGoalProjectionVersions(projectionVersions, refMonth),
    [projectionVersions, refMonth],
  );
  const sortedVisibleGoals = useMemo(
    () => sortGoalsByAllocationPercentage(visibleGoals, activeFinancialRules),
    [activeFinancialRules, visibleGoals],
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
  const availableBalance = calculateAvailableForContributions(monthlySurplus, allocatedThisMonth);
  const referenceLabel = new Date(`${refMonth}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const isMissingPlanningRpc = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (error.code === "PGRST202" || /function|schema cache|reserve_goal_funds|withdraw_goal_funds|delete_goal/i.test(error.message || "")));

  const selectGoalForAllocation = (goalId: string) => {
    setSelectedGoalId(goalId);
    setAllocAmount("");
  };

  const handleAllocate = async (goalId = selectedGoalId, rawAmount = allocAmount) => {
    const amount = parseFloat(rawAmount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe o valor que você realmente guardou.");
      return;
    }
    if (!goalId) {
      toast.error("Selecione um plano.");
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
      const goal = goals.find((g) => g.id === goalId);
      if (!goal) throw new Error("Plano não encontrado.");
      const finalTarget = Number(goal.target_amount || 0);

      const rpcResult = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)("reserve_goal_funds", {
        p_goal_id: goalId,
        p_account_id: primaryAccount.id,
        p_amount: amount,
        p_ref_month: refMonth,
        p_description: `Aporte realizado em ${referenceLabel}`,
      });
      if (rpcResult.error && !isMissingPlanningRpc(rpcResult.error)) throw rpcResult.error;

      if (rpcResult.error) {
        const { error: gErr } = await supabase
          .from("goals")
          .update({
            current_amount: Number(goal.current_amount || 0) + amount,
            is_completed: finalTarget > 0 && Number(goal.current_amount || 0) + amount >= finalTarget,
          })
          .eq("id", goalId);
        if (gErr) throw gErr;
        const { error: aErr } = await supabase
          .from("accounts")
          .update({ current_balance: Number(primaryAccount.current_balance || 0) - amount })
          .eq("id", primaryAccount.id);
        if (aErr) throw aErr;
        let { error: tErr } = await supabase.from("goal_transactions").insert({
          user_id: userId,
          goal_id: goalId,
          account_id: primaryAccount.id,
          amount,
          type: "deposit",
          description: `Aporte realizado em ${referenceLabel}`,
          ref_month: refMonth,
        });
        if (tErr && /account_id|ref_month/i.test(tErr.message)) {
          const fallback = await supabase.from("goal_transactions").insert({
            user_id: userId,
            goal_id: goalId,
            amount,
            type: "deposit",
            description: `Aporte realizado em ${referenceLabel}`,
          });
          tErr = fallback.error;
        }
        if (tErr) throw tErr;
      }

      toast.success(`Aporte de ${formatCurrency(amount)} registrado em "${goal.name}".`);
      setAllocAmount("");
      setSelectedGoalId("");
      setContributionAmount("");
      setContributionGoalId(null);
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
      const rpcResult = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)("delete_goal_and_release_funds", {
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
      const rpcResult = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)("withdraw_goal_funds", {
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

  const openTransactionEditor = (tx: GoalTx) => {
    setEditingTx(tx);
    setEditTxAmount(Number(tx.amount).toFixed(2).replace(".", ","));
    setEditTxMonth(tx.ref_month || tx.created_at.slice(0, 7));
    setEditTxDescription(tx.description || "");
  };

  const handleUpdateTransaction = async () => {
    if (!editingTx) return;
    const amount = Number(editTxAmount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(editTxMonth)) {
      toast.error("Informe uma competência válida.");
      return;
    }

    setSavingTx(true);
    try {
      const description = editTxDescription.trim() || `${editingTx.type === "deposit" ? "Aporte realizado" : "Retirada realizada"} em ${monthTitle(editTxMonth)}`;
      const result = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)('update_goal_transaction', {
        p_transaction_id: editingTx.id,
        p_amount: amount,
        p_ref_month: editTxMonth,
        p_description: description,
      });
      if (result.error) throw result.error;

      setGoalTxs((current) => current.map((tx) => tx.id === editingTx.id
        ? { ...tx, amount, ref_month: editTxMonth, description }
        : tx));
      setEditingTx(null);
      toast.success("Movimentação atualizada. Os saldos foram recalculados.");
      onReload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar a movimentação."));
    } finally {
      setSavingTx(false);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!txToDelete) return;
    setDeletingTxId(txToDelete.id);
    try {
      const result = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)('delete_goal_transaction', {
        p_transaction_id: txToDelete.id,
      });
      if (result.error) throw result.error;

      setGoalTxs((current) => current.filter((tx) => tx.id !== txToDelete.id));
      setTxToDelete(null);
      toast.success("Movimentação excluída. Os saldos foram recalculados.");
      onReload();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao excluir a movimentação."));
    } finally {
      setDeletingTxId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-0 shadow-card bg-gradient-to-br from-success/10 to-success/5">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-success" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Você pode guardar agora
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
              Sobra de {referenceLabel} disponível para seus planos
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-card bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Total guardado
              </p>
            </div>
            <p className="font-heading text-2xl font-extrabold text-primary">{formatCurrency(totalReserved)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Em {visibleGoals.length} plano{visibleGoals.length !== 1 ? "s" : ""} ativo{visibleGoals.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <GoalAllocationChart
        goals={sortedVisibleGoals}
        activeRules={activeFinancialRules}
        monthlyIncome={monthlyIncome}
        monthlyAvailable={monthlySurplus}
        referenceLabel={referenceLabel}
      />

      <Card className="overflow-hidden border-0 shadow-elevated" data-allocate>
        <div className="gradient-primary px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-primary-foreground">
            <PiggyBank className="h-5 w-5" /> Guardar dinheiro em um plano
          </h2>
        </div>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Registre somente o valor que saiu da sua conta e foi realmente guardado. A meta percentual é configurada em cada plano.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px] lg:items-end">
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Quanto você realmente guardou?</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 500,00"
                  value={allocAmount}
                  onChange={(event) => setAllocAmount(event.target.value)}
                  className="h-11 border-2 pl-10 text-right text-base font-bold focus:border-primary"
                />
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Em qual plano?</p>
              <Select value={selectedGoalId} onValueChange={selectGoalForAllocation}>
                <SelectTrigger className="h-11 w-full min-w-0">
                  <SelectValue placeholder="Escolha um plano" />
                </SelectTrigger>
                <SelectContent>
                  {sortedVisibleGoals.map((g) => {
                    const GoalIcon = getGoalIcon(g);
                    return (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-2">
                        <GoalIcon className="h-3.5 w-3.5 text-primary" />
                        {g.name}
                      </span>
                    </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button
                className="gradient-primary h-11 w-full gap-2 whitespace-nowrap text-sm font-semibold text-primary-foreground"
                onClick={() => void handleAllocate()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
                Registrar aporte
              </Button>
            </div>
          </div>
          <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2 sm:flex-col sm:justify-center sm:gap-1 sm:text-center">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sobra disponível no mês</span>
              <strong className="shrink-0 text-xs tabular-nums text-success">{formatCurrency(monthlySurplus)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2 sm:flex-col sm:justify-center sm:gap-1 sm:text-center">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ainda pode guardar</span>
              <strong className="shrink-0 text-xs tabular-nums text-success">{formatCurrency(availableBalance)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2 sm:flex-col sm:justify-center sm:gap-1 sm:text-center">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guardado nesta competência</span>
              <strong className="shrink-0 text-xs tabular-nums text-primary">{formatCurrency(allocatedThisMonth)}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
          <Target className="h-4 w-4 text-primary" /> Meus planos
        </h2>
        <Button
          size="sm"
          className="gradient-primary h-9 gap-1.5 rounded-xl border border-primary/30 px-3 text-xs font-bold text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
          onClick={() => { setEditingGoal(null); setGoalDialogOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" /> Novo plano
        </Button>
      </div>

      {sortedVisibleGoals.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-8 text-center">
            <PiggyBank className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum plano criado ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Crie um objetivo para transformar sua sobra mensal em um plano.</p>
            <Button
              size="sm"
              className="gradient-primary mt-4 gap-1.5 border border-primary/30 text-primary-foreground shadow-md shadow-primary/30 hover:brightness-105"
              onClick={() => { setEditingGoal(null); setGoalDialogOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeiro plano
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedVisibleGoals.map((goal) => {
            const current = Number(goal.current_amount || 0);
            const projectionVersion = activeProjectionVersions.get(goal.id) || null;
            const target = calculateGoalTarget(Number(goal.target_amount || 0), projectionVersion, averageMonthlyExpenses);
            const hasFinalTarget = target > 0;
            const progress = hasFinalTarget ? Math.min((current / target) * 100, 100) : 0;
            const targetReached = hasFinalTarget && current >= target;
            const isExpanded = expandedGoalId === goal.id;
            const currentRule = activeFinancialRules.find((rule) => rule.goal_id === goal.id) || null;
            const suggested = calculateSuggestedContribution(currentRule, { monthlyIncome, monthlyAvailable: monthlySurplus });
            const actualThisMonth = Number(realizedByGoal[goal.id] || 0);
            const monthlyAchievement = calculateMonthlyGoalAchievement(suggested, actualThisMonth);
            const difference = actualThisMonth - suggested;
            const contributionStats = calculateContributionStats(goalMovements, goal.id, refMonth);
            const annualRate = getEffectiveAnnualRate(projectionVersion, referenceRates);
            const noYieldProjection = projectGoalCompletion({
              currentAmount: current,
              targetAmount: target,
              monthlyContribution: contributionStats.averageMonthly,
              refMonth,
            });
            const yieldProjection = annualRate > 0 ? projectGoalCompletion({
              currentAmount: current,
              targetAmount: target,
              monthlyContribution: contributionStats.averageMonthly,
              annualRate,
              refMonth,
            }) : null;
            const referenceRate = projectionVersion?.yield_type === "cdi" || projectionVersion?.yield_type === "selic"
              ? referenceRates.find((rate) => rate.rate_key === projectionVersion.yield_type)
              : null;
            const monthsCovered = averageMonthlyExpenses > 0 ? current / averageMonthlyExpenses : 0;
            const isContributionOpen = contributionGoalId === goal.id;
            const GoalIcon = getGoalIcon(goal);
            const ruleLabel = !currentRule
              ? "Meta mensal não definida"
              : currentRule.value_type === "percentage"
                ? `${Number(currentRule.value).toLocaleString("pt-BR")}% ${currentRule.calculation_base === "total_income" ? "da renda" : "do disponível"}`
                : `${formatCurrency(Number(currentRule.value))} por mês`;

            return (
              <Card
                key={goal.id}
                className={cn("overflow-hidden border-0 shadow-card transition-all", targetReached && "ring-2 ring-success/30")}
              >
                <CardContent className="p-0">
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                          <GoalIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-heading text-base font-bold">{goal.name}</h3>
                          {targetReached && (
                            <Badge className="border-success/30 bg-success/15 text-[10px] text-success">Meta atingida</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {goal.deadline
                            ? `Prazo: ${new Date(goal.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`
                            : "Sem prazo definido"}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-primary">
                          Meta de {referenceLabel}: {ruleLabel}
                        </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
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
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total acumulado do plano</p>
                      <div className="mb-1.5 flex items-end justify-between">
                        <span className="font-heading text-xl font-extrabold text-primary">{formatCurrency(current)}</span>
                        {hasFinalTarget ? (
                          <span className="text-xs text-muted-foreground">de {formatCurrency(target)}</span>
                        ) : (
                          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] text-primary">Destino contínuo</Badge>
                        )}
                      </div>
                      {hasFinalTarget ? (
                        <>
                          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-700 ease-out",
                                targetReached ? "bg-gradient-to-r from-success to-success/80" : "bg-gradient-to-r from-primary to-primary/80",
                              )}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-primary">{progress.toFixed(0)}%</span>
                            <span className={cn("text-[11px]", targetReached ? "font-semibold text-success" : "text-muted-foreground")}>
                              {current > target
                                ? `Meta superada em ${formatCurrency(current - target)}`
                                : targetReached
                                  ? "Você atingiu a meta e pode continuar destinando"
                                  : `Falta ${formatCurrency(target - current)}`}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                          Sem valor final: acompanhe apenas quanto você separou e destinou ao longo do tempo.
                        </p>
                      )}
                    </div>

                    <div className={cn("grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/25 p-3", hasFinalTarget ? "sm:grid-cols-3" : "sm:grid-cols-4")}>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sugestão do mês</p>
                        <p className="mt-1 text-xs font-bold text-foreground">{formatCurrency(suggested)}</p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">{ruleLabel}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Guardado no mês</p>
                        <p className="mt-1 text-xs font-bold text-success">{formatCurrency(actualThisMonth)}</p>
                        <p className={cn("mt-0.5 text-[9px]", difference >= 0 ? "text-success" : "text-destructive")}>
                          {difference > 0 ? "+" : ""}{formatCurrency(difference)} vs. planejado
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Meta mensal atingida</p>
                        <p className={cn("mt-1 text-xs font-bold", monthlyAchievement >= 100 ? "text-success" : "text-primary")}>
                          {monthlyAchievement.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Média de aportes</p>
                        <p className="mt-1 text-xs font-bold text-foreground">{formatCurrency(contributionStats.averageMonthly)}/mês</p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">{contributionStats.monthsObserved || 0} mês(es) observado(s)</p>
                      </div>
                      {hasFinalTarget && <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Previsão sem rendimento</p>
                        <p className="mt-1 text-xs font-bold text-foreground">
                          {noYieldProjection.completionMonth ? monthTitle(noYieldProjection.completionMonth) : "Ainda sem previsão"}
                        </p>
                        {noYieldProjection.months !== null && <p className="mt-0.5 text-[9px] text-muted-foreground">{noYieldProjection.months} meses restantes</p>}
                      </div>}
                      {hasFinalTarget && <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Rentabilidade</p>
                        <p className="mt-1 text-xs font-bold text-foreground">
                          {!projectionVersion || projectionVersion.yield_type === "none"
                            ? "Sem rendimento"
                            : projectionVersion.yield_type === "manual"
                              ? `${annualRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`
                              : `${Number(projectionVersion.yield_rate_percent).toLocaleString("pt-BR")}% do ${projectionVersion.yield_type.toUpperCase()}`}
                        </p>
                        {yieldProjection?.completionMonth && <p className="mt-0.5 text-[9px] text-success">Com rendimento: {monthTitle(yieldProjection.completionMonth)}</p>}
                      </div>}
                    </div>

                    {projectionVersion?.target_mode === "emergency_months" && (
                      <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                        Sua reserva cobre <strong className="text-primary">{monthsCovered.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mês(es)</strong> de um objetivo de <strong className="text-foreground">{Number(projectionVersion.emergency_months || 0).toLocaleString("pt-BR")} meses</strong>.
                      </div>
                    )}

                    {hasFinalTarget && contributionStats.averageMonthly <= 0 && !targetReached && (
                      <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        Faça seus primeiros aportes para calcular uma previsão.
                      </p>
                    )}

                    {hasFinalTarget && yieldProjection && (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Estimativa baseada na taxa atual. Taxas futuras podem mudar.{referenceRate?.is_approximation ? " O CDI exibido é uma aproximação identificada." : ""}
                      </p>
                    )}

                    {(
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Button
                          size="sm"
                          className="gradient-primary h-9 gap-1.5 rounded-xl text-[11px] text-primary-foreground sm:col-span-1"
                          onClick={() => {
                            setContributionGoalId(isContributionOpen ? null : goal.id);
                            setContributionAmount("");
                          }}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" /> {targetReached ? "Adicionar mais" : "Informar aporte do mês"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl text-[11px]"
                          onClick={() => { setEditingGoal(goal); setGoalDialogOpen(true); }}
                        >
                          <Settings2 className="h-3.5 w-3.5" /> Alterar meta mensal
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl text-[11px]"
                          onClick={() => setProjectionGoal(goal)}
                        >
                          <CalendarClock className="h-3.5 w-3.5" /> {hasFinalTarget ? "Meta final e rendimento" : "Definir objetivo final"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl text-[11px]"
                          onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Histórico
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl text-[11px]"
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

                    {isContributionOpen && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <Label className="text-[11px] font-semibold text-foreground">
                          Quanto você realmente guardou em {referenceLabel}?
                        </Label>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R$</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex.: 900,00"
                              value={contributionAmount}
                              onChange={(event) => setContributionAmount(event.target.value)}
                              className="h-10 bg-background pl-10 text-right font-bold"
                            />
                          </div>
                          <Button
                            className="h-10 gap-2 px-5"
                            disabled={saving}
                            onClick={() => void handleAllocate(goal.id, contributionAmount)}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
                            Registrar
                          </Button>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Sugestão: {formatCurrency(suggested)} · ainda disponível no mês: {formatCurrency(availableBalance)}. Você pode superar a sugestão.
                        </p>
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
                            <div key={tx.id} className="flex flex-col gap-2 rounded-lg bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-2">
                                <div
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-full",
                                    tx.type === "deposit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                                  )}
                                >
                                  {tx.type === "deposit" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">{tx.description || (tx.type === "deposit" ? "Depósito" : "Retirada")}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {tx.ref_month ? `Competência: ${monthTitle(tx.ref_month)}` : new Date(tx.created_at).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 sm:justify-end">
                                <p className={cn("mr-1 text-sm font-bold", tx.type === "deposit" ? "text-success" : "text-destructive")}>
                                  {tx.type === "deposit" ? "+" : "-"}
                                  {formatCurrency(Number(tx.amount))}
                                </p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
                                  onClick={() => openTransactionEditor(tx)}
                                  aria-label="Editar movimentação"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                                  onClick={() => setTxToDelete(tx)}
                                  disabled={deletingTxId === tx.id}
                                  aria-label="Excluir movimentação"
                                >
                                  {deletingTxId === tx.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                  Excluir
                                </Button>
                              </div>
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
        onOpenChange={(open) => { setGoalDialogOpen(open); if (!open) setEditingGoal(null); }}
        userId={userId}
        refMonth={refMonth}
        goal={editingGoal}
        currentRule={editingGoal ? resolveFinancialRules(financialRules, refMonth).find((rule) => rule.goal_id === editingGoal.id) || null : null}
        financialRules={financialRules}
        onCreated={onReload}
      />

      <GoalProjectionDialog
        open={!!projectionGoal}
        onOpenChange={(open) => !open && setProjectionGoal(null)}
        userId={userId}
        refMonth={refMonth}
        goal={projectionGoal}
        currentVersion={projectionGoal ? activeProjectionVersions.get(projectionGoal.id) || null : null}
        averageMonthlyExpenses={averageMonthlyExpenses}
        referenceRates={referenceRates}
        onSaved={onReload}
      />

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
                placeholder="Ex.: 250,00"
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

      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Editar movimentação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              O saldo do plano e, quando houver vínculo, o da conta de origem serão corrigidos automaticamente.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-goal-tx-amount" className="text-xs text-muted-foreground">Valor</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    id="edit-goal-tx-amount"
                    type="text"
                    inputMode="decimal"
                    value={editTxAmount}
                    onChange={(event) => setEditTxAmount(event.target.value)}
                    className="pl-10 text-right font-bold"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-goal-tx-month" className="text-xs text-muted-foreground">Competência</Label>
                <Input
                  id="edit-goal-tx-month"
                  type="month"
                  value={editTxMonth}
                  onChange={(event) => setEditTxMonth(event.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-goal-tx-description" className="text-xs text-muted-foreground">Descrição</Label>
              <Input
                id="edit-goal-tx-description"
                value={editTxDescription}
                onChange={(event) => setEditTxDescription(event.target.value)}
                placeholder="Ex.: Aporte de agosto"
                className="mt-1"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEditingTx(null)} disabled={savingTx}>Cancelar</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={() => void handleUpdateTransaction()} disabled={savingTx}>
                {savingTx ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                Salvar alteração
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!txToDelete} onOpenChange={(open) => !open && setTxToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro de <strong>{txToDelete ? formatCurrency(Number(txToDelete.amount)) : ""}</strong> será removido. O saldo do plano e, quando houver vínculo, o da conta de origem serão ajustados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingTxId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteTransaction()}
              disabled={!!deletingTxId}
            >
              {deletingTxId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir movimentação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
