import { supabase } from "@/integrations/supabase/client";

const DEFAULT_GOALS = [
  { name: "Reserva de emergência", target_amount: 10000 },
  { name: "Viagem", target_amount: 5000 },
  { name: "Compra de carro", target_amount: 50000 },
];

const GOALS_INIT_KEY = "finance_goals_initialized";

export async function ensureDefaultGoals(userId: string) {
  const done = localStorage.getItem(`${GOALS_INIT_KEY}_${userId}`);
  if (done) return;

  const { data, error } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error || (data && data.length > 0)) {
    localStorage.setItem(`${GOALS_INIT_KEY}_${userId}`, "1");
    return;
  }

  const rows = DEFAULT_GOALS.map((g) => ({
    user_id: userId,
    name: g.name,
    target_amount: g.target_amount,
    current_amount: 0,
  }));

  await supabase.from("goals").insert(rows);
  localStorage.setItem(`${GOALS_INIT_KEY}_${userId}`, "1");
}
