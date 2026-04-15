
-- =============================================
-- ACCOUNTS
-- =============================================
CREATE TYPE public.account_type AS ENUM ('cash', 'checking', 'savings', 'credit_card', 'investment', 'loan');
CREATE TYPE public.account_scope AS ENUM ('personal', 'business');

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'checking',
  scope public.account_scope NOT NULL DEFAULT 'personal',
  institution TEXT,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  credit_limit NUMERIC,
  include_in_net_worth BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounts" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_accounts_user ON public.accounts(user_id);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TYPE public.category_kind AS ENUM ('income', 'expense', 'transfer');

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind public.category_kind NOT NULL DEFAULT 'expense',
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#E65A8D',
  icon TEXT DEFAULT 'tag',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_categories_user ON public.categories(user_id);

-- =============================================
-- PAYEES
-- =============================================
CREATE TABLE public.payees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  default_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payees" ON public.payees FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_payees_user ON public.payees(user_id);

-- =============================================
-- TRANSACTIONS
-- =============================================
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'paid', 'overdue', 'canceled');

CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  payee_id UUID REFERENCES public.payees(id) ON DELETE SET NULL,
  type public.transaction_type NOT NULL DEFAULT 'expense',
  amount NUMERIC NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status public.transaction_status NOT NULL DEFAULT 'pending',
  counterpart_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  recurrence_id UUID,
  source TEXT,
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_account ON public.transactions(account_id);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);

-- =============================================
-- RECURRENCES
-- =============================================
CREATE TYPE public.recurrence_frequency AS ENUM ('weekly', 'monthly', 'yearly');

CREATE TABLE public.recurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  frequency public.recurrence_frequency NOT NULL DEFAULT 'monthly',
  auto_create BOOLEAN NOT NULL DEFAULT true,
  template_payload JSONB,
  next_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recurrences" ON public.recurrences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add FK on transactions
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurrence_fk FOREIGN KEY (recurrence_id) REFERENCES public.recurrences(id) ON DELETE SET NULL;

-- =============================================
-- BUDGETS
-- =============================================
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  ref_month TEXT NOT NULL,
  limit_amount NUMERIC NOT NULL,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budgets" ON public.budgets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_budgets_user_month ON public.budgets(user_id, ref_month);

-- =============================================
-- GOALS
-- =============================================
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  target_amount NUMERIC NOT NULL,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  deadline DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- TAGS
-- =============================================
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#E65A8D',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- TRANSACTION_TAGS
-- =============================================
CREATE TABLE public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transaction_tags" ON public.transaction_tags FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()));

-- =============================================
-- ATTACHMENTS
-- =============================================
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attachments" ON public.attachments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- DEFAULT CATEGORIES FOR NEW USERS
-- =============================================
CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, kind, icon, color, is_system) VALUES
    (NEW.id, 'Alimentação', 'expense', 'utensils', '#FF6B6B', true),
    (NEW.id, 'Transporte', 'expense', 'car', '#4ECDC4', true),
    (NEW.id, 'Moradia', 'expense', 'home', '#45B7D1', true),
    (NEW.id, 'Saúde', 'expense', 'heart', '#96CEB4', true),
    (NEW.id, 'Educação', 'expense', 'book-open', '#FFEAA7', true),
    (NEW.id, 'Lazer', 'expense', 'gamepad-2', '#DDA0DD', true),
    (NEW.id, 'Vestuário', 'expense', 'shirt', '#F0B27A', true),
    (NEW.id, 'Assinaturas', 'expense', 'repeat', '#BB8FCE', true),
    (NEW.id, 'Outros', 'expense', 'ellipsis', '#AEB6BF', true),
    (NEW.id, 'Salário', 'income', 'banknote', '#2ECC71', true),
    (NEW.id, 'Freelance', 'income', 'briefcase', '#27AE60', true),
    (NEW.id, 'Investimentos', 'income', 'trending-up', '#1ABC9C', true),
    (NEW.id, 'Outros (Receita)', 'income', 'plus-circle', '#82E0AA', true),
    (NEW.id, 'Transferência', 'transfer', 'arrow-right-left', '#85929E', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_default_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_categories();
