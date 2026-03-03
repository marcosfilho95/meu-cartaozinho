
-- Cards table
CREATE TABLE public.cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  default_due_day INTEGER CHECK (default_due_day >= 1 AND default_due_day <= 28),
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Purchases table
CREATE TABLE public.purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  installments_count INTEGER NOT NULL CHECK (installments_count >= 1),
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 28),
  start_month TEXT NOT NULL, -- YYYY-MM format
  notes TEXT,
  person TEXT, -- para quem emprestou
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Installments table
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  installments_count INTEGER NOT NULL,
  ref_month TEXT NOT NULL, -- YYYY-MM format
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 28),
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cards_user ON public.cards(user_id);
CREATE INDEX idx_purchases_user_card ON public.purchases(user_id, card_id);
CREATE INDEX idx_installments_user_card_month ON public.installments(user_id, card_id, ref_month);
CREATE INDEX idx_installments_purchase ON public.installments(purchase_id);

-- RLS on cards
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cards" ON public.cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS on purchases
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own purchases" ON public.purchases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS on installments
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own installments" ON public.installments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
