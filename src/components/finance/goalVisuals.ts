import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bike,
  Bitcoin,
  Briefcase,
  Building2,
  CarFront,
  Coins,
  Dog,
  Dumbbell,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Music,
  Palmtree,
  PartyPopper,
  PiggyBank,
  Plane,
  
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Wrench,
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

const iconsByKeyword: Array<[RegExp, LucideIcon]> = [
  [/emerg|reserva|colchao|seguranca/, Coins],
  [/viagem|viajar|ferias|passagem|europa|disney|intercambio|mochila/, Plane],
  [/carro|veiculo|automovel|moto\b|carrao|garagem|cnh|habilitacao/, CarFront],
  [/bicicleta|bike|patinete/, Bike],
  [/casa|apartamento|imovel|entrada d|reforma|mudanca|aluguel|terreno/, Home],
  [/movel|moveis|sofa|geladeira|eletrodomestic|decorac|cozinha|enxoval/, Sofa],
  [/notebook|computador|pc\b|setup|macbook|tablet/, Laptop],
  [/celular|iphone|smartphone|telefone/, Smartphone],
  [/games?|videogame|playstation|xbox|nintendo|console/, Gamepad2],
  [/roupa|vestuario|tenis|guarda roupa|moda/, Shirt],
  [/casamento|noivado|alianca|anel|joia/, Gem],
  [/festa|aniversario|formatura|comemora/, PartyPopper],
  [/presente|natal|amigo secreto/, Gift],
  [/pet|cachorro|gato|animal/, Dog],
  [/academia|gym|treino|shape|esporte|corrida/, Dumbbell],
  [/saude|dentista|cirurgia|tratamento|plano de saude|medic/, Stethoscope],
  [/terapia|bem estar|autocuidado|psico/, HeartPulse],
  [/doa|caridade|dizimo|oferta|ajuda/, HandHeart],
  [/filh|familia|bebe|maternidade|enxoval do bebe/, Baby],
  [/educa|faculdade|curso|estudo|escola|pos gradua|mestrado|ingles|idioma|livro/, GraduationCap],
  [/aposent|previd|pgbl|vgbl|futuro tranquilo/, Palmtree],
  [/cripto|bitcoin|ethereum|btc\b/, Bitcoin],
  [/acao|acoes|bolsa|fii|tesouro|renda fixa|cdb|invest|dividendo/, TrendingUp],
  [/negocio|empresa|empreend|freela|trabalho|projeto/, Briefcase],
  [/banco|fundo|patrimonio|imposto|divida|quitar/, Landmark],
  [/instrumento|violao|guitarra|musica|show/, Music],
  [/obra|ferrament|conserto|manuten/, Wrench],
  [/predio|escritorio|loja|comercial/, Building2],
  [/poupa|guardar|economia|juntar|caixinha|cofrinho|dinheiro/, PiggyBank],
];

export const getGoalIcon = (goal: Pick<GoalIdentity, "name" | "goal_type">): LucideIcon => {
  const typeIcon = goal.goal_type && goal.goal_type !== "custom" ? iconsByType[goal.goal_type] : undefined;
  if (typeIcon) return typeIcon;

  const name = normalize(goal.name);
  const match = iconsByKeyword.find(([pattern]) => pattern.test(name));
  return match?.[1] ?? Sparkles;
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
