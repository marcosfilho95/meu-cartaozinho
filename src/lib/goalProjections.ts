import { addMonthsToKey } from "@/lib/financeShared";
import type { GoalContributionMovement } from "@/lib/goalContributions";
import { getContributionMonth } from "@/lib/goalContributions";
import { untypedSupabase } from "@/lib/supabaseUntyped";

export type GoalTargetMode = "fixed" | "emergency_months";
export type GoalYieldType = "none" | "cdi" | "selic" | "manual";

export type GoalProjectionVersion = {
  id: string;
  user_id: string;
  goal_id: string;
  effective_month: string;
  target_mode: GoalTargetMode;
  target_amount: number;
  emergency_months: number | null;
  yield_type: GoalYieldType;
  yield_rate_percent: number;
  created_at: string;
};

export type ReferenceRate = {
  rate_key: "selic" | "cdi";
  annual_rate: number;
  as_of_date: string;
  source: string;
  is_approximation: boolean;
  updated_at: string;
};

export type GoalContributionStats = {
  total: number;
  averageMonthly: number;
  monthsObserved: number;
  firstMonth: string | null;
};

export type GoalProjection = {
  months: number | null;
  completionMonth: string | null;
  projectedBalance: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const monthDistance = (fromMonth: string, toMonth: string) => {
  const [fromYear, fromNumber] = fromMonth.split("-").map(Number);
  const [toYear, toNumber] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toNumber - fromNumber);
};

export const resolveGoalProjectionVersions = (
  versions: GoalProjectionVersion[],
  refMonth: string,
) => {
  const latest = new Map<string, GoalProjectionVersion>();
  [...versions]
    .filter((version) => version.effective_month <= refMonth)
    .sort((left, right) =>
      right.effective_month.localeCompare(left.effective_month) ||
      right.created_at.localeCompare(left.created_at),
    )
    .forEach((version) => {
      if (!latest.has(version.goal_id)) latest.set(version.goal_id, version);
    });
  return latest;
};

export const calculateContributionStats = (
  movements: GoalContributionMovement[],
  goalId: string,
  refMonth: string,
): GoalContributionStats => {
  const monthly = new Map<string, number>();
  movements
    .filter((movement) => movement.goal_id === goalId)
    .filter((movement) => getContributionMonth(movement) <= refMonth)
    .forEach((movement) => {
      const month = getContributionMonth(movement);
      if (!month) return;
      const signed = movement.type === "withdraw"
        ? -Math.abs(Number(movement.amount) || 0)
        : movement.type === "deposit"
          ? Math.abs(Number(movement.amount) || 0)
          : 0;
      monthly.set(month, (monthly.get(month) || 0) + signed);
    });

  const months = [...monthly.keys()].sort();
  if (months.length === 0) return { total: 0, averageMonthly: 0, monthsObserved: 0, firstMonth: null };
  const firstMonth = months[0];
  const monthsObserved = Math.max(monthDistance(firstMonth, refMonth) + 1, 1);
  const total = [...monthly.values()].reduce((sum, value) => sum + value, 0);
  return {
    total: roundMoney(total),
    averageMonthly: roundMoney(Math.max(total, 0) / monthsObserved),
    monthsObserved,
    firstMonth,
  };
};

export const calculateGoalTarget = (
  fallbackTarget: number,
  version: GoalProjectionVersion | null | undefined,
  averageMonthlyExpenses: number,
) => version?.target_mode === "emergency_months"
  ? roundMoney(Math.max(averageMonthlyExpenses, 0) * Math.max(Number(version.emergency_months || 0), 0))
  : Math.max(Number(version?.target_amount || fallbackTarget || 0), 0);

export const getEffectiveAnnualRate = (
  version: GoalProjectionVersion | null | undefined,
  rates: ReferenceRate[],
) => {
  if (!version || version.yield_type === "none") return 0;
  if (version.yield_type === "manual") return Math.max(Number(version.yield_rate_percent || 0), 0);
  const reference = rates.find((rate) => rate.rate_key === version.yield_type);
  if (!reference) return 0;
  return Math.max(Number(reference.annual_rate || 0), 0) * Math.max(Number(version.yield_rate_percent || 0), 0) / 100;
};

export const projectGoalCompletion = ({
  currentAmount,
  targetAmount,
  monthlyContribution,
  annualRate = 0,
  refMonth,
  maxMonths = 1200,
}: {
  currentAmount: number;
  targetAmount: number;
  monthlyContribution: number;
  annualRate?: number;
  refMonth: string;
  maxMonths?: number;
}): GoalProjection => {
  const target = Math.max(Number(targetAmount || 0), 0);
  let balance = Math.max(Number(currentAmount || 0), 0);
  const contribution = Math.max(Number(monthlyContribution || 0), 0);
  if (target <= 0) {
    return { months: null, completionMonth: null, projectedBalance: roundMoney(balance) };
  }
  if (balance >= target) {
    return { months: 0, completionMonth: refMonth, projectedBalance: roundMoney(balance) };
  }
  if (contribution <= 0) return { months: null, completionMonth: null, projectedBalance: roundMoney(balance) };

  const monthlyRate = annualRate > 0 ? Math.pow(1 + annualRate / 100, 1 / 12) - 1 : 0;
  for (let month = 1; month <= maxMonths; month += 1) {
    balance = balance * (1 + monthlyRate) + contribution;
    if (balance >= target) {
      return {
        months: month,
        completionMonth: addMonthsToKey(refMonth, month),
        projectedBalance: roundMoney(balance),
      };
    }
  }
  return { months: null, completionMonth: null, projectedBalance: roundMoney(balance) };
};

export const fetchGoalProjectionVersions = async (userId: string, refMonth: string) => {
  const { data, error } = await untypedSupabase
    .from("goal_projection_versions")
    .select("id, user_id, goal_id, effective_month, target_mode, target_amount, emergency_months, yield_type, yield_rate_percent, created_at")
    .eq("user_id", userId)
    .lte("effective_month", refMonth)
    .order("effective_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []) as GoalProjectionVersion[];
};

export const createGoalProjectionVersion = async (
  version: Omit<GoalProjectionVersion, "id" | "created_at">,
) => {
  const { error } = await untypedSupabase.from("goal_projection_versions").insert(version);
  if (error) throw error;
};

const BCB_SELIC_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/10?formato=json";

const parseBcbDate = (value: string) => {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
};

export const fetchReferenceRates = async (): Promise<ReferenceRate[]> => {
  const { data: cachedData } = await untypedSupabase
    .from("financial_reference_rates")
    .select("rate_key, annual_rate, as_of_date, source, is_approximation, updated_at")
    .in("rate_key", ["selic", "cdi"]);
  const cached = (cachedData || []) as ReferenceRate[];
  const isFresh = cached.length === 2 && cached.every((rate) =>
    Date.now() - new Date(rate.updated_at).getTime() < 24 * 60 * 60 * 1000,
  );
  if (isFresh) return cached;

  try {
    const response = await fetch(BCB_SELIC_URL);
    if (!response.ok) throw new Error("BCB indisponível");
    const values = await response.json() as Array<{ data: string; valor: string }>;
    const latest = values.at(-1);
    const selic = Number(latest?.valor?.replace(",", "."));
    if (!latest || !Number.isFinite(selic) || selic <= 0) throw new Error("Taxa Selic inválida");
    const asOfDate = parseBcbDate(latest.data);
    const cdi = Math.max(selic - 0.1, 0);
    const rpc = untypedSupabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    await rpc("cache_financial_reference_rate", {
      p_rate_key: "selic",
      p_annual_rate: selic,
      p_as_of_date: asOfDate,
      p_source: "Banco Central do Brasil · SGS 432",
      p_is_approximation: false,
    });
    await rpc("cache_financial_reference_rate", {
      p_rate_key: "cdi",
      p_annual_rate: cdi,
      p_as_of_date: asOfDate,
      p_source: "Aproximação: Meta Selic BCB − 0,10 p.p.",
      p_is_approximation: true,
    });
    const now = new Date().toISOString();
    return [
      { rate_key: "selic", annual_rate: selic, as_of_date: asOfDate, source: "Banco Central do Brasil · SGS 432", is_approximation: false, updated_at: now },
      { rate_key: "cdi", annual_rate: cdi, as_of_date: asOfDate, source: "Aproximação: Meta Selic BCB − 0,10 p.p.", is_approximation: true, updated_at: now },
    ];
  } catch {
    return cached;
  }
};
