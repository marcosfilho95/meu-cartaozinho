-- Completa categorias padrao por usuario (com hierarquia)

CREATE OR REPLACE FUNCTION public.create_default_categories_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house uuid;
  v_food uuid;
  v_transport uuid;
  v_health uuid;
  v_education uuid;
  v_leisure uuid;
  v_subscriptions uuid;
  v_taxes uuid;
  v_others_expense uuid;

  v_salary uuid;
  v_extra_income uuid;
  v_invest_income uuid;

  v_transfer uuid;
BEGIN
  -- Expense parents
  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Casa', 'expense', '#45B7D1', 'home', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Casa') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Alimentacao', 'expense', '#FF6B6B', 'utensils', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Alimentacao') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Transporte', 'expense', '#4ECDC4', 'car', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Transporte') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Saude', 'expense', '#96CEB4', 'heart', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Saude') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Educacao', 'expense', '#FFEAA7', 'book-open', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Educacao') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Lazer', 'expense', '#DDA0DD', 'gamepad-2', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Lazer') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Assinaturas', 'expense', '#BB8FCE', 'repeat', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Assinaturas') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Impostos', 'expense', '#F0B27A', 'tag', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Impostos') AND c.kind = 'expense' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Outros', 'expense', '#AEB6BF', 'ellipsis', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Outros') AND c.kind = 'expense' AND c.parent_id IS NULL);

  -- Income parents
  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Salario', 'income', '#2ECC71', 'banknote', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Salario') AND c.kind = 'income' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Renda Extra', 'income', '#27AE60', 'briefcase', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Renda Extra') AND c.kind = 'income' AND c.parent_id IS NULL);

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Investimentos', 'income', '#1ABC9C', 'trending-up', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Investimentos') AND c.kind = 'income' AND c.parent_id IS NULL);

  -- Transfer parent
  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
  SELECT p_user_id, 'Transferencias', 'transfer', '#85929E', 'arrow-right-left', true
  WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND lower(c.name) = lower('Transferencias') AND c.kind = 'transfer' AND c.parent_id IS NULL);

  SELECT id INTO v_house FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Casa') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_food FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Alimentacao') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_transport FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Transporte') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_health FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Saude') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_education FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Educacao') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_leisure FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Lazer') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_subscriptions FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Assinaturas') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_taxes FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Impostos') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_others_expense FROM public.categories WHERE user_id = p_user_id AND kind = 'expense' AND lower(name) = lower('Outros') AND parent_id IS NULL LIMIT 1;

  SELECT id INTO v_salary FROM public.categories WHERE user_id = p_user_id AND kind = 'income' AND lower(name) = lower('Salario') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_extra_income FROM public.categories WHERE user_id = p_user_id AND kind = 'income' AND lower(name) = lower('Renda Extra') AND parent_id IS NULL LIMIT 1;
  SELECT id INTO v_invest_income FROM public.categories WHERE user_id = p_user_id AND kind = 'income' AND lower(name) = lower('Investimentos') AND parent_id IS NULL LIMIT 1;

  SELECT id INTO v_transfer FROM public.categories WHERE user_id = p_user_id AND kind = 'transfer' AND lower(name) = lower('Transferencias') AND parent_id IS NULL LIMIT 1;

  -- Expense children
  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Aluguel', 'expense', v_house, '#45B7D1', 'home', true
  WHERE v_house IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Aluguel') AND c.parent_id = v_house);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Condominio', 'expense', v_house, '#45B7D1', 'home', true
  WHERE v_house IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Condominio') AND c.parent_id = v_house);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Energia', 'expense', v_house, '#45B7D1', 'sparkles', true
  WHERE v_house IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Energia') AND c.parent_id = v_house);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Agua', 'expense', v_house, '#45B7D1', 'sparkles', true
  WHERE v_house IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Agua') AND c.parent_id = v_house);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Internet', 'expense', v_house, '#45B7D1', 'wifi', true
  WHERE v_house IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Internet') AND c.parent_id = v_house);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Mercado', 'expense', v_food, '#FF6B6B', 'shopping-cart', true
  WHERE v_food IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Mercado') AND c.parent_id = v_food);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Restaurante', 'expense', v_food, '#FF6B6B', 'utensils', true
  WHERE v_food IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Restaurante') AND c.parent_id = v_food);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Delivery', 'expense', v_food, '#FF6B6B', 'coffee', true
  WHERE v_food IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Delivery') AND c.parent_id = v_food);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Gasolina', 'expense', v_transport, '#4ECDC4', 'car', true
  WHERE v_transport IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Gasolina') AND c.parent_id = v_transport);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Uber e Taxi', 'expense', v_transport, '#4ECDC4', 'car', true
  WHERE v_transport IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Uber e Taxi') AND c.parent_id = v_transport);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Transporte Publico', 'expense', v_transport, '#4ECDC4', 'car', true
  WHERE v_transport IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Transporte Publico') AND c.parent_id = v_transport);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Farmacia', 'expense', v_health, '#96CEB4', 'heart', true
  WHERE v_health IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Farmacia') AND c.parent_id = v_health);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Consultas', 'expense', v_health, '#96CEB4', 'heart', true
  WHERE v_health IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Consultas') AND c.parent_id = v_health);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Exames', 'expense', v_health, '#96CEB4', 'heart', true
  WHERE v_health IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Exames') AND c.parent_id = v_health);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Cursos', 'expense', v_education, '#FFEAA7', 'book-open', true
  WHERE v_education IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Cursos') AND c.parent_id = v_education);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Livros', 'expense', v_education, '#FFEAA7', 'book-open', true
  WHERE v_education IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Livros') AND c.parent_id = v_education);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Viagens', 'expense', v_leisure, '#DDA0DD', 'plane', true
  WHERE v_leisure IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Viagens') AND c.parent_id = v_leisure);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Streaming', 'expense', v_subscriptions, '#BB8FCE', 'phone', true
  WHERE v_subscriptions IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('Streaming') AND c.parent_id = v_subscriptions);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'IPTU', 'expense', v_taxes, '#F0B27A', 'tag', true
  WHERE v_taxes IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('IPTU') AND c.parent_id = v_taxes);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'IPVA', 'expense', v_taxes, '#F0B27A', 'tag', true
  WHERE v_taxes IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'expense' AND lower(c.name) = lower('IPVA') AND c.parent_id = v_taxes);

  -- Income children
  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Freelance', 'income', v_extra_income, '#27AE60', 'briefcase', true
  WHERE v_extra_income IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'income' AND lower(c.name) = lower('Freelance') AND c.parent_id = v_extra_income);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Bonus', 'income', v_extra_income, '#27AE60', 'sparkles', true
  WHERE v_extra_income IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'income' AND lower(c.name) = lower('Bonus') AND c.parent_id = v_extra_income);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Dividendos', 'income', v_invest_income, '#1ABC9C', 'trending-up', true
  WHERE v_invest_income IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'income' AND lower(c.name) = lower('Dividendos') AND c.parent_id = v_invest_income);

  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Rendimentos', 'income', v_invest_income, '#1ABC9C', 'trending-up', true
  WHERE v_invest_income IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'income' AND lower(c.name) = lower('Rendimentos') AND c.parent_id = v_invest_income);

  -- Transfer child
  INSERT INTO public.categories (user_id, name, kind, parent_id, color, icon, is_system)
  SELECT p_user_id, 'Entre Contas', 'transfer', v_transfer, '#85929E', 'arrow-right-left', true
  WHERE v_transfer IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.user_id = p_user_id AND c.kind = 'transfer' AND lower(c.name) = lower('Entre Contas') AND c.parent_id = v_transfer);

END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_default_categories_for_user(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_default_categories ON auth.users;
CREATE TRIGGER trg_default_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_categories();

-- Backfill em usuarios existentes
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN SELECT id FROM auth.users LOOP
    PERFORM public.create_default_categories_for_user(v_user_id);
  END LOOP;
END;
$$;
