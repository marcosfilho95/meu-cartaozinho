
-- 1. Revoke public access and add owner check to default accounts function
CREATE OR REPLACE FUNCTION public.create_default_accounts_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.accounts (user_id, name, type, scope, include_in_net_worth, initial_balance, current_balance, is_active, closing_day, due_day, credit_limit)
  SELECT p_user_id, name, type, scope, include_in_net_worth, 0, 0, true, closing_day, due_day, credit_limit
  FROM (VALUES
    ('Carteira', 'cash'::account_type, 'personal'::account_scope, true, NULL::int, NULL::int, NULL::numeric),
    ('Conta Corrente', 'checking'::account_type, 'personal'::account_scope, true, NULL, NULL, NULL),
    ('Poupanca', 'savings'::account_type, 'personal'::account_scope, true, NULL, NULL, NULL),
    ('Cartao de Credito', 'credit_card'::account_type, 'personal'::account_scope, false, 25, 5, 0),
    ('Reserva de Emergencia', 'investment'::account_type, 'personal'::account_scope, true, NULL, NULL, NULL)
  ) AS defaults(name, type, scope, include_in_net_worth, closing_day, due_day, credit_limit)
  WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_user_id LIMIT 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_default_accounts_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_default_accounts_for_user(uuid) TO authenticated;

-- 2. Revoke public access and add owner check to default categories function
CREATE OR REPLACE FUNCTION public.create_default_categories_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Only insert if user has no categories yet
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id LIMIT 1) THEN
    INSERT INTO public.categories (user_id, name, kind, icon, color, is_system) VALUES
      (p_user_id, 'Alimentação', 'expense', 'utensils', '#FF6B6B', true),
      (p_user_id, 'Transporte', 'expense', 'car', '#4ECDC4', true),
      (p_user_id, 'Moradia', 'expense', 'home', '#45B7D1', true),
      (p_user_id, 'Saúde', 'expense', 'heart', '#96CEB4', true),
      (p_user_id, 'Educação', 'expense', 'book-open', '#FFEAA7', true),
      (p_user_id, 'Lazer', 'expense', 'gamepad-2', '#DDA0DD', true),
      (p_user_id, 'Outros', 'expense', 'ellipsis', '#AEB6BF', true),
      (p_user_id, 'Salário', 'income', 'banknote', '#2ECC71', true),
      (p_user_id, 'Investimentos', 'income', 'trending-up', '#1ABC9C', true),
      (p_user_id, 'Transferência', 'transfer', 'arrow-right-left', '#85929E', true);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_default_categories_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_default_categories_for_user(uuid) TO authenticated;

-- 3. Restrict username-to-email lookup to authenticated users only
REVOKE EXECUTE ON FUNCTION public.get_login_email_by_username(text) FROM anon;
