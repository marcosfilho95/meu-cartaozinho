CREATE TABLE IF NOT EXISTS public.goal_projection_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  effective_month TEXT NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  target_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (target_mode IN ('fixed', 'emergency_months')),
  target_amount NUMERIC NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  emergency_months NUMERIC CHECK (emergency_months IS NULL OR emergency_months > 0),
  yield_type TEXT NOT NULL DEFAULT 'none' CHECK (yield_type IN ('none', 'cdi', 'selic', 'manual')),
  yield_rate_percent NUMERIC NOT NULL DEFAULT 0 CHECK (yield_rate_percent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_projection_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own goal projection versions" ON public.goal_projection_versions;
CREATE POLICY "Users manage own goal projection versions"
  ON public.goal_projection_versions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.goals goal
      WHERE goal.id = goal_id AND goal.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_goal_projection_versions_lookup
  ON public.goal_projection_versions(user_id, goal_id, effective_month DESC, created_at DESC);

INSERT INTO public.goal_projection_versions(
  user_id, goal_id, effective_month, target_mode, target_amount,
  emergency_months, yield_type, yield_rate_percent, created_at
)
SELECT
  goal.user_id,
  goal.id,
  to_char(goal.created_at AT TIME ZONE 'America/Fortaleza', 'YYYY-MM'),
  'fixed',
  goal.target_amount,
  NULL,
  'none',
  0,
  goal.created_at
FROM public.goals goal
WHERE NOT EXISTS (
  SELECT 1 FROM public.goal_projection_versions version
  WHERE version.goal_id = goal.id
);

CREATE TABLE IF NOT EXISTS public.financial_reference_rates (
  rate_key TEXT PRIMARY KEY CHECK (rate_key IN ('selic', 'cdi')),
  annual_rate NUMERIC NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 100),
  as_of_date DATE NOT NULL,
  source TEXT NOT NULL,
  is_approximation BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_reference_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read financial reference rates" ON public.financial_reference_rates;
CREATE POLICY "Authenticated users read financial reference rates"
  ON public.financial_reference_rates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.cache_financial_reference_rate(
  p_rate_key TEXT,
  p_annual_rate NUMERIC,
  p_as_of_date DATE,
  p_source TEXT,
  p_is_approximation BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  IF p_rate_key NOT IN ('selic', 'cdi') THEN RAISE EXCEPTION 'Taxa de referência inválida'; END IF;
  IF p_annual_rate IS NULL OR p_annual_rate < 0 OR p_annual_rate > 100 THEN RAISE EXCEPTION 'Valor de taxa inválido'; END IF;

  INSERT INTO public.financial_reference_rates(rate_key, annual_rate, as_of_date, source, is_approximation, updated_at)
  VALUES (p_rate_key, p_annual_rate, p_as_of_date, p_source, p_is_approximation, now())
  ON CONFLICT (rate_key) DO UPDATE
  SET annual_rate = EXCLUDED.annual_rate,
      as_of_date = EXCLUDED.as_of_date,
      source = EXCLUDED.source,
      is_approximation = EXCLUDED.is_approximation,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.cache_financial_reference_rate(TEXT, NUMERIC, DATE, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cache_financial_reference_rate(TEXT, NUMERIC, DATE, TEXT, BOOLEAN) TO authenticated;

-- Amplia os tipos aceitos para todos os modelos oferecidos na interface.
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_goal_type_check;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_goal_type_check
  CHECK (goal_type IN (
    'emergency', 'savings', 'investment', 'pgbl', 'family', 'travel',
    'car', 'home', 'donation', 'education', 'retirement', 'custom', 'other'
  ));
