CREATE TABLE public.investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  issuer TEXT NOT NULL,
  title_type TEXT NOT NULL CHECK (title_type IN ('cdb', 'rdb', 'treasury_selic', 'lci', 'lca', 'other')),
  indexer TEXT NOT NULL CHECK (indexer IN ('cdi', 'selic', 'fixed', 'ipca')),
  rate_percent NUMERIC NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 1000),
  liquidity_daily BOOLEAN NOT NULL DEFAULT false,
  maturity_date DATE,
  started_at DATE NOT NULL,
  taxable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.investment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  investment_id UUID NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_investments_user_id ON public.investments(user_id, started_at DESC);
CREATE INDEX idx_investment_transactions_investment_id ON public.investment_transactions(investment_id, transaction_date);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own investments" ON public.investments
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own investment transactions" ON public.investment_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
