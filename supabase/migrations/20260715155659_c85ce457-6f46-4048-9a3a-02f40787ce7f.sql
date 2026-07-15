-- Align categorization_rules with existing ImportsPage code
ALTER TABLE public.categorization_rules
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Widen match_type check to include the values used by the app
ALTER TABLE public.categorization_rules DROP CONSTRAINT IF EXISTS categorization_rules_match_type_check;
ALTER TABLE public.categorization_rules
  ADD CONSTRAINT categorization_rules_match_type_check
  CHECK (match_type IN ('exact', 'equals', 'contains', 'startswith', 'starts_with', 'regex'));

-- Optional direction check (CREDIT/DEBIT or null)
ALTER TABLE public.categorization_rules DROP CONSTRAINT IF EXISTS categorization_rules_direction_check;
ALTER TABLE public.categorization_rules
  ADD CONSTRAINT categorization_rules_direction_check
  CHECK (direction IS NULL OR direction IN ('CREDIT', 'DEBIT'));

CREATE INDEX IF NOT EXISTS categorization_rules_active_idx
  ON public.categorization_rules(user_id, is_active, priority);