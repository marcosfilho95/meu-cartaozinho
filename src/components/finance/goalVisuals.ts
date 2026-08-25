import type { LucideIcon } from "lucide-react";
import {
  Baby,
  CarFront,
  Coins,
  GraduationCap,
  HandHeart,
  Home,
  Landmark,
  Palmtree,
  PiggyBank,
  Plane,
  Sparkles,
  TrendingUp,
} from "lucide-react";

type GoalIdentity = {
  id: string;
  name: string;
  goal_type?: string | null;
};

type GoalRule = {
  goal_id?: string | null;
  value_type?: string | null;
  value?: number | string | null;
};

const iconsByType: Record<string, LucideIcon> = {
  emergency: Coins,
  savings: PiggyBank,
  investment: TrendingUp,
  pgbl: Landmark,
  family: Baby,
  travel: Plane,
  car: CarFront,
  home: Home,
  donation: HandHeart,
  education: GraduationCap,
  retirement: Palmtree,
  custom: Sparkles,
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR");

export const getGoalIcon = (goal: Pick<GoalIdentity, "name" | "goal_type">): LucideIcon => {
  if (goal.goal_type && iconsByType[goal.goal_type]) return iconsByType[goal.goal_type];

  const name = normalize(goal.name);
  if (/emerg|reserva/.test(name)) return Coins;
  if (/viagem|viajar|ferias/.test(name)) return Plane;
  if (/carro|veiculo|automovel/.test(name)) return CarFront;
  if (/casa|apartamento|imovel/.test(name)) return Home;
  if (/doa|caridade/.test(name)) return HandHeart;
  if (/filh|familia/.test(name)) return Baby;
  if (/educa|faculdade|curso|estudo/.test(name)) return GraduationCap;
  if (/aposent|previd|pgbl/.test(name)) return Palmtree;
  if (/invest/.test(name)) return TrendingUp;
  if (/poupa|guardar/.test(name)) return PiggyBank;
  return Sparkles;
};

export const getGoalAllocationPercentage = (goalId: string, rules: GoalRule[]) => {
  const rule = rules.find((candidate) => candidate.goal_id === goalId);
  if (!rule || rule.value_type !== "percentage") return -1;
  const percentage = Number(rule.value || 0);
  return Number.isFinite(percentage) ? percentage : -1;
};

export const sortGoalsByAllocationPercentage = <T extends GoalIdentity>(goals: T[], rules: GoalRule[]) => (
  [...goals].sort((left, right) => {
    const percentageDifference = getGoalAllocationPercentage(right.id, rules)
      - getGoalAllocationPercentage(left.id, rules);
    if (percentageDifference !== 0) return percentageDifference;
    return left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
  })
);
