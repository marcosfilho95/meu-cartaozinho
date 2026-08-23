ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS monthly_target NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

CREATE TABLE IF NOT EXISTS public.financial_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rule_key TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  effective_month TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'fixed',
  value NUMERIC NOT NULL,
  calculation_base TEXT NOT NULL DEFAULT 'total_income',
  goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_rule_versions_month_check CHECK (effective_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT financial_rule_versions_value_check CHECK (value >= 0),
  CONSTRAINT financial_rule_versions_value_type_check CHECK (value_type IN ('fixed', 'percentage')),
  CONSTRAINT financial_rule_versions_base_check CHECK (calculation_base IN ('total_income', 'available_after_priorities'))
);

ALTER TABLE public.financial_rule_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own financial rule versions" ON public.financial_rule_versions;
CREATE POLICY "Users manage own financial rule versions"
  ON public.financial_rule_versions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_financial_rule_versions_lookup
  ON public.financial_rule_versions(user_id, rule_key, effective_month DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_rule_versions_goal
  ON public.financial_rule_versions(user_id, goal_id, effective_month DESC)
  WHERE goal_id IS NOT NULL;

COMMENT ON TABLE public.financial_rule_versions IS
  'Append-only versions of financial planning rules. The latest version effective on or before a competence month wins.';

-- Preserve existing global monthly limits as historical versions.
INSERT INTO public.financial_rule_versions (
  user_id, rule_key, rule_type, effective_month, value_type, value, calculation_base, priority, created_at
)
SELECT
  b.user_id,
  'spending_limit',
  'spending_limit',
  b.ref_month,
  'fixed',
  b.limit_amount,
  'total_income',
  0,
  b.created_at
FROM public.budgets b
WHERE b.category_id IS NULL
  AND b.limit_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_rule_versions v
    WHERE v.user_id = b.user_id
      AND v.rule_key = 'spending_limit'
      AND v.effective_month = b.ref_month
      AND v.value = b.limit_amount
  );

-- Convert the old fixed monthly target of each cofrinho into its first version.
INSERT INTO public.financial_rule_versions (
  user_id, rule_key, rule_type, effective_month, value_type, value,
  calculation_base, goal_id, priority, created_at
)
SELECT
  g.user_id,
  'goal:' || g.id::text,
  COALESCE(NULLIF(g.goal_type, ''), 'custom'),
  to_char(g.created_at AT TIME ZONE 'America/Fortaleza', 'YYYY-MM'),
  'fixed',
  g.monthly_target,
  'available_after_priorities',
  g.id,
  COALESCE(g.priority, 100),
  g.created_at
FROM public.goals g
WHERE COALESCE(g.monthly_target, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_rule_versions v
    WHERE v.user_id = g.user_id AND v.rule_key = 'goal:' || g.id::text
  );
