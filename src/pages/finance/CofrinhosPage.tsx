import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { GoalsSection } from "@/components/finance/GoalsSection";
import { MonthNavigator } from "@/components/MonthNavigator";
import { getMonthlySpendingGoal } from "@/lib/financeBudget";
import { buildFinancialPlan, fetchFinancialRuleVersions, type FinancialRuleVersion } from "@/lib/financialRules";
import { fetchFinanceTransactions, monthKey } from "@/lib/financeShared";
import { getSavingsPlan, getTransactionsForMonth, type PlanningGoal } from "@/lib/financePlanning";
import { calculateReserveMovement, type GoalMovement } from "@/lib/financeOverview";
import { shouldIncludeInRealizedCalculations } from "@/lib/financeRealization";

interface CofrinhosPageProps {
  userId: string;
}

type GoalRow = PlanningGoal & { id: string; goal_type?: string; priority?: number };
type AccountRow = { id: string; name: string; type: string; current_balance?: number | null };

const CofrinhosPage: React.FC<CofrinhosPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [allocated, setAllocated] = useState(0);
  const [surplus, setSurplus] = useState(0);
  const [financialRules, setFinancialRules] = useState<FinancialRuleVersion[]>([]);
  const [refMonth, setRefMonth] = useState(() => monthKey(new Date()));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [goalsRes, accountsRes, transactions, goalTxRes, budgetsRes, loadedRules] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
        supabase
          .from("accounts")
          .select("id, name, type, current_balance")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("name"),
        fetchFinanceTransactions(userId, 3),
        untypedSupabase
          .from("goal_transactions")
          .select("amount, type, created_at")
          .eq("user_id", userId)
          .limit(1000),
        supabase.from("budgets").select("category_id, limit_amount").eq("user_id", userId).eq("ref_month", refMonth),
        fetchFinancialRuleVersions(userId, refMonth),
      ]);

      if (goalsRes.error) throw goalsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      const loadedGoals = (goalsRes.data || []) as GoalRow[];
      setAccounts((accountsRes.data || []) as AccountRow[]);

      const monthTransactions = getTransactionsForMonth(transactions, refMonth);
      const income = monthTransactions
        .filter((tx) => tx.type === "income" && tx.status !== "canceled" && shouldIncludeInRealizedCalculations(tx))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const expenses = monthTransactions
        .filter((tx) => tx.type === "expense" && tx.status !== "canceled" && shouldIncludeInRealizedCalculations(tx))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const financialPlan = buildFinancialPlan(
        loadedRules,
        refMonth,
        income,
        getMonthlySpendingGoal(budgetsRes.data || []),
      );
      const plannedGoals = loadedGoals.map((goal) => ({
        ...goal,
        monthly_target: financialPlan.goalAmounts.get(goal.id) ?? Number(goal.monthly_target || 0),
      }));
      setGoals(plannedGoals);
      setFinancialRules(loadedRules);
      const plan = getSavingsPlan({ income, expenses, goals: plannedGoals, refMonth });
      setSurplus(plan.positiveSurplus);

      const reserveMovement = calculateReserveMovement((goalTxRes.data || []) as GoalMovement[], refMonth);
      setAllocated(Math.max(reserveMovement.net, 0));
    } catch {
      toast.error("Não foi possível carregar seus cofrinhos.");
    } finally {
      setLoading(false);
    }
  }, [refMonth, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><PiggyBank className="h-5 w-5 text-primary" />
          <div>
          <h1 className="font-heading text-xl font-bold">Meus planos</h1>
          <p className="text-xs text-muted-foreground">
            Escolha um objetivo, guarde quando puder e acompanhe quanto falta.
          </p>
          </div>
        </div>
        <MonthNavigator currentMonth={refMonth} onMonthChange={setRefMonth} />
      </header>

      <GoalsSection
        userId={userId}
        goals={goals}
        accounts={accounts}
        monthlySurplus={surplus}
        allocatedThisMonth={allocated}
        refMonth={refMonth}
        financialRules={financialRules}
        onReload={loadData}
      />
    </div>
  );
};

export default CofrinhosPage;
