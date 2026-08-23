-- Garante a competência dos aportes mesmo em bancos onde a migration anterior
-- ainda não foi aplicada.
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

-- O saldo do plano é derivado somente de aportes e retiradas realizados.
CREATE OR REPLACE FUNCTION public.sync_goal_amount_from_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id UUID := COALESCE(NEW.goal_id, OLD.goal_id);
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'deposit' THEN ABS(amount)
      WHEN type = 'withdraw' THEN -ABS(amount)
      ELSE 0
    END
  ), 0)
  INTO v_total
  FROM public.goal_transactions
  WHERE goal_id = v_goal_id;

  UPDATE public.goals
  SET current_amount = GREATEST(v_total, 0),
      is_completed = GREATEST(v_total, 0) >= target_amount
  WHERE id = v_goal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_goal_amount_after_movement ON public.goal_transactions;
CREATE TRIGGER sync_goal_amount_after_movement
AFTER INSERT OR UPDATE OR DELETE ON public.goal_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_goal_amount_from_transactions();

-- Reconcilia os planos que já possuem histórico. Regras percentuais não entram aqui.
WITH movement_totals AS (
  SELECT
    goal_id,
    GREATEST(COALESCE(SUM(
      CASE
        WHEN type = 'deposit' THEN ABS(amount)
        WHEN type = 'withdraw' THEN -ABS(amount)
        ELSE 0
      END
    ), 0), 0) AS total
  FROM public.goal_transactions
  GROUP BY goal_id
)
UPDATE public.goals AS goal
SET current_amount = totals.total,
    is_completed = totals.total >= goal.target_amount
FROM movement_totals AS totals
WHERE goal.id = totals.goal_id;

-- A disponibilidade é calculada pela competência na aplicação. O saldo contábil da
-- conta continua sendo movimentado, mas deixa de ser uma segunda base divergente.
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
  v_goal_current NUMERIC;
  v_goal_target NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês de referência inválido'; END IF;

  PERFORM 1
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id AND is_active
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;

  SELECT current_amount, target_amount INTO v_goal_current, v_goal_target
  FROM public.goals
  WHERE id = p_goal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado'; END IF;
  IF v_goal_current + p_amount > v_goal_target THEN RAISE EXCEPTION 'O valor ultrapassa o objetivo final do plano'; END IF;

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

REVOKE ALL ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
