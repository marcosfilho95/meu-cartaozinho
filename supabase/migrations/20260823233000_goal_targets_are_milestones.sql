-- O valor final é um marco de acompanhamento, não um teto para novos aportes.
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

  UPDATE public.accounts
  SET current_balance = current_balance - p_amount
  WHERE id = p_account_id;

  UPDATE public.goals
  SET current_amount = current_amount + p_amount,
      is_completed = target_amount > 0 AND current_amount + p_amount >= target_amount
  WHERE id = p_goal_id;

  INSERT INTO public.goal_transactions(user_id, goal_id, account_id, amount, type, description, ref_month)
  VALUES (v_user_id, p_goal_id, p_account_id, p_amount, 'deposit', p_description, p_ref_month);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_goal_funds(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_goal_transaction(
  p_transaction_id UUID,
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
  v_transaction public.goal_transactions%ROWTYPE;
  v_goal_total NUMERIC;
  v_old_account_effect NUMERIC;
  v_new_account_effect NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_ref_month IS NULL OR p_ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mês de referência inválido';
  END IF;

  SELECT * INTO v_transaction
  FROM public.goal_transactions
  WHERE id = p_transaction_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimentação não encontrada'; END IF;

  PERFORM 1
  FROM public.goals
  WHERE id = v_transaction.goal_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado'; END IF;

  SELECT COALESCE(SUM(
    CASE WHEN type = 'deposit' THEN ABS(amount) ELSE -ABS(amount) END
  ), 0)
  INTO v_goal_total
  FROM public.goal_transactions
  WHERE goal_id = v_transaction.goal_id AND id <> v_transaction.id;

  v_goal_total := v_goal_total + CASE
    WHEN v_transaction.type = 'deposit' THEN ABS(p_amount)
    ELSE -ABS(p_amount)
  END;

  IF v_goal_total < 0 THEN RAISE EXCEPTION 'A retirada ultrapassa o saldo do plano'; END IF;

  IF v_transaction.account_id IS NOT NULL THEN
    v_old_account_effect := CASE
      WHEN v_transaction.type = 'deposit' THEN -ABS(v_transaction.amount)
      ELSE ABS(v_transaction.amount)
    END;
    v_new_account_effect := CASE
      WHEN v_transaction.type = 'deposit' THEN -ABS(p_amount)
      ELSE ABS(p_amount)
    END;

    UPDATE public.accounts
    SET current_balance = COALESCE(current_balance, 0) + (v_new_account_effect - v_old_account_effect)
    WHERE id = v_transaction.account_id AND user_id = v_user_id;
  END IF;

  UPDATE public.goal_transactions
  SET amount = ABS(p_amount),
      ref_month = p_ref_month,
      description = NULLIF(BTRIM(p_description), '')
  WHERE id = v_transaction.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_goal_transaction(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_goal_transaction(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
