CREATE TABLE public.goal_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit', 'withdraw')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own goal_transactions"
  ON public.goal_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_goal_transactions_goal_id ON public.goal_transactions(goal_id);
CREATE INDEX idx_goal_transactions_user_id ON public.goal_transactions(user_id);