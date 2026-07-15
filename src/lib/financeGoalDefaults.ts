import { supabase } from "@/integrations/supabase/client";

const DEFAULT_GOALS = [
  { name: "Reserva de emergência", target_amount: 30000, monthly_target: 0, goal_type: "emergency", priority: 1 },
  { name: "Viagem dos sonhos", target_amount: 12000, monthly_target: 0, goal_type: "travel", priority: 3 },
  { name: "Entrada do apartamento", target_amount: 100000, monthly_target: 0, goal_type: "home", priority: 2 },
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
    monthly_target: g.monthly_target,
    goal_type: g.goal_type,
    priority: g.priority,
    current_amount: 0,
  }));

  let { error: insertError } = await supabase.from("goals").insert(rows);
  if (insertError && /goal_type|monthly_target|priority/i.test(insertError.message)) {
    const fallback = await supabase.from("goals").insert(
      DEFAULT_GOALS.map((goal) => ({
        user_id: userId,
        name: goal.name,
        target_amount: goal.target_amount,
        current_amount: 0,
      })),
    );
    insertError = fallback.error;
  }
  if (!insertError) localStorage.setItem(`${GOALS_INIT_KEY}_${userId}`, "1");
}
