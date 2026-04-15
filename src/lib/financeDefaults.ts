import { supabase } from "@/integrations/supabase/client";

type DefaultAccount = {
  name: string;
  type: "cash" | "checking" | "savings" | "credit_card" | "investment" | "loan";
  scope: "personal" | "business";
  include_in_net_worth: boolean;
  closing_day?: number | null;
  due_day?: number | null;
  credit_limit?: number | null;
};

const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  { name: "Carteira", type: "cash", scope: "personal", include_in_net_worth: true },
  { name: "Conta Corrente", type: "checking", scope: "personal", include_in_net_worth: true },
  { name: "Poupanca", type: "savings", scope: "personal", include_in_net_worth: true },
  {
    name: "Cartao de Credito",
    type: "credit_card",
    scope: "personal",
    include_in_net_worth: false,
    closing_day: 25,
    due_day: 5,
    credit_limit: 0,
  },
  { name: "Reserva de Emergencia", type: "investment", scope: "personal", include_in_net_worth: true },
  { name: "Casa", type: "checking", scope: "personal", include_in_net_worth: true },
  { name: "Alimentacao", type: "checking", scope: "personal", include_in_net_worth: true },
  { name: "Transporte", type: "checking", scope: "personal", include_in_net_worth: true },
  { name: "Saude", type: "checking", scope: "personal", include_in_net_worth: true },
  { name: "Lazer", type: "checking", scope: "personal", include_in_net_worth: true },
];

export const ensureDefaultAccounts = async (userId: string) => {
  const { count, error: countError } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw countError;
  if ((count || 0) > 0) return false;

  const payload = DEFAULT_ACCOUNTS.map((item) => ({
    user_id: userId,
    name: item.name,
    type: item.type,
    scope: item.scope,
    institution: null,
    initial_balance: 0,
    current_balance: 0,
    include_in_net_worth: item.include_in_net_worth,
    is_active: true,
    closing_day: item.closing_day ?? null,
    due_day: item.due_day ?? null,
    credit_limit: item.credit_limit ?? null,
  }));

  const { error } = await supabase.from("accounts").insert(payload);
  if (error) throw error;
  return true;
};

