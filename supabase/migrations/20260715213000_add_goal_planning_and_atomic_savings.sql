ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS monthly_target NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 3;

UPDATE public.goals
SET goal_type = CASE
  WHEN lower(name) LIKE '%emerg%' OR lower(name) LIKE '%reserva%' THEN 'emergency'
  WHEN lower(name) LIKE '%viag%' OR lower(name) LIKE '%sonho%' THEN 'travel'
  WHEN lower(name) LIKE '%apart%' OR lower(name) LIKE '%casa%' OR lower(name) LIKE '%imóv%' THEN 'home'
  WHEN lower(name) LIKE '%filh%' OR lower(name) LIKE '%famíl%' THEN 'family'
  WHEN lower(name) LIKE '%educ%' OR lower(name) LIKE '%faculd%' THEN 'education'
  ELSE goal_type
END
WHERE goal_type = 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_goal_type_check'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_goal_type_check
      CHECK (goal_type IN ('emergency', 'travel', 'home', 'family', 'education', 'retirement', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_monthly_target_check'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_monthly_target_check CHECK (monthly_target >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_priority_check'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_priority_check CHECK (priority BETWEEN 1 AND 5);
  END IF;
END
$$;

ALTER TABLE public.goal_transactions
  ADD COLUMN IF NOT EXISTS ref_month TEXT,
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

UPDATE public.goal_transactions
SET ref_month = to_char(created_at AT TIME ZONE 'America/Fortaleza', 'YYYY-MM')
WHERE ref_month IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goal_transactions_ref_month_check'
  ) THEN
    ALTER TABLE public.goal_transactions
      ADD CONSTRAINT goal_transactions_ref_month_check
      CHECK (ref_month IS NULL OR ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_goal_transactions_user_ref_month
  ON public.goal_transactions(user_id, ref_month);

CREATE OR REPLACE FUNCTION public.reserve_goal_funds(
  p_goal_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_ref_month TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account_balance NUMERIC;
  v_goal_current NUMERIC;
  v_goal_target NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês de referência inválido'; END IF;

  SELECT current_balance INTO v_account_balance
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
  IF v_account_balance < p_amount THEN RAISE EXCEPTION 'Saldo disponível insuficiente'; END IF;

  SELECT current_amount, target_amount INTO v_goal_current, v_goal_target
  FROM public.goals
  WHERE id = p_goal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meta não encontrada'; END IF;
  IF v_goal_current + p_amount > v_goal_target THEN RAISE EXCEPTION 'O valor ultrapassa o objetivo da meta'; END IF;

  UPDATE public.accounts
  SET current_balance = current_balance - p_amount
  WHERE id = p_account_id;

  UPDATE public.goals
  SET current_amount = current_amount + p_amount,
      is_completed = current_amount + p_amount >= target_amount
  WHERE id = p_goal_id;

  INSERT INTO public.goal_transactions(user_id, goal_id, account_id, amount, type, description, ref_month)
  VALUES (v_user_id, p_goal_id, p_account_id, p_amount, 'deposit', p_description, p_ref_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_goal_funds(
  p_goal_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_ref_month TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_goal_current NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês de referência inválido'; END IF;

  PERFORM 1 FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;

  SELECT current_amount INTO v_goal_current
  FROM public.goals
  WHERE id = p_goal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meta não encontrada'; END IF;
  IF v_goal_current < p_amount THEN RAISE EXCEPTION 'Valor indisponível na meta'; END IF;

  UPDATE public.goals
  SET current_amount = current_amount - p_amount,
      is_completed = false
  WHERE id = p_goal_id;

  UPDATE public.accounts
  SET current_balance = current_balance + p_amount
  WHERE id = p_account_id;

  INSERT INTO public.goal_transactions(user_id, goal_id, account_id, amount, type, description, ref_month)
  VALUES (v_user_id, p_goal_id, p_account_id, p_amount, 'withdraw', p_description, p_ref_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_goal_and_release_funds(
  p_goal_id UUID,
  p_account_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_goal_current NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;

  PERFORM 1 FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;

  SELECT current_amount INTO v_goal_current
  FROM public.goals
  WHERE id = p_goal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meta não encontrada'; END IF;

  UPDATE public.accounts
  SET current_balance = current_balance + v_goal_current
  WHERE id = p_account_id;

  DELETE FROM public.goals WHERE id = p_goal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_goal_and_release_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_goal_and_release_funds(UUID, UUID) TO authenticated;
