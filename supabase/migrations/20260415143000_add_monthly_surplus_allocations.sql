CREATE TABLE IF NOT EXISTS public.monthly_surplus_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ref_month TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('free', 'reserve', 'goal', 'account')),
  label TEXT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monthly_surplus_allocations_user_month
ON public.monthly_surplus_allocations(user_id, ref_month);

ALTER TABLE public.monthly_surplus_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_surplus_allocations'
      AND policyname = 'Users manage own monthly surplus allocations'
  ) THEN
    CREATE POLICY "Users manage own monthly surplus allocations"
      ON public.monthly_surplus_allocations
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

