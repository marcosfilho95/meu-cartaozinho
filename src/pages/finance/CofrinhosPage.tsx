import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { GoalsSection } from "@/components/finance/GoalsSection";
import { fetchFinanceTransactions, monthKey } from "@/lib/financeShared";
import { getSavingsPlan, getTransactionsForMonth, type PlanningGoal } from "@/lib/financePlanning";
import { calculateReserveMovement, type GoalMovement } from "@/lib/financeOverview";

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

  const refMonth = useMemo(() => monthKey(new Date()), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [goalsRes, accountsRes, transactions, goalTxRes] = await Promise.all([
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
          .select("amount, type, ref_month, created_at")
          .eq("user_id", userId)
          .limit(1000),
      ]);

      if (goalsRes.error) throw goalsRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const loadedGoals = (goalsRes.data || []) as GoalRow[];
      setGoals(loadedGoals);
      setAccounts((accountsRes.data || []) as AccountRow[]);

      const monthTransactions = getTransactionsForMonth(transactions, refMonth);
      const income = monthTransactions
        .filter((tx) => tx.type === "income" && tx.status !== "canceled")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const expenses = monthTransactions
        .filter((tx) => tx.type === "expense" && tx.status !== "canceled")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const plan = getSavingsPlan({ income, expenses, goals: loadedGoals, refMonth });
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
      <header className="flex items-center gap-2">
        <PiggyBank className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-heading text-lg font-bold">Cofrinhos e sonhos</h1>
          <p className="text-xs text-muted-foreground">
            Casa, poupança, filhos, viagem: guarde por objetivo e acompanhe o progresso.
          </p>
        </div>
      </header>

      <GoalsSection
        userId={userId}
        goals={goals}
        accounts={accounts}
        monthlySurplus={surplus}
        allocatedThisMonth={allocated}
        refMonth={refMonth}
        onReload={loadData}
      />
    </div>
  );
};

export default CofrinhosPage;
