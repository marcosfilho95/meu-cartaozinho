-- Default accounts for new and existing users (when they have no accounts)

CREATE OR REPLACE FUNCTION public.create_default_accounts_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts a WHERE a.user_id = p_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.accounts (
    user_id,
    name,
    type,
    scope,
    institution,
    initial_balance,
    current_balance,
    closing_day,
    due_day,
    credit_limit,
    include_in_net_worth,
    is_active
  )
  VALUES
    (p_user_id, 'Carteira', 'cash', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Conta Corrente', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Poupanca', 'savings', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Cartao de Credito', 'credit_card', 'personal', NULL, 0, 0, 25, 5, 0, false, true),
    (p_user_id, 'Reserva de Emergencia', 'investment', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Casa', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Alimentacao', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Transporte', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Saude', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true),
    (p_user_id, 'Lazer', 'checking', 'personal', NULL, 0, 0, NULL, NULL, NULL, true, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_default_accounts_for_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_accounts ON auth.users;
CREATE TRIGGER trg_default_accounts
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_accounts();

-- Backfill: users that already exist and still have zero accounts
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT u.id
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.user_id = u.id
    )
  LOOP
    PERFORM public.create_default_accounts_for_user(v_user_id);
  END LOOP;
END;
$$;
