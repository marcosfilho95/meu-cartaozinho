-- Categorization rules: per-user learned rules for auto-categorizing imported transactions
CREATE TABLE IF NOT EXISTS public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'startswith', 'regex')),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern, match_type)
);

CREATE INDEX IF NOT EXISTS categorization_rules_user_idx ON public.categorization_rules(user_id);
CREATE INDEX IF NOT EXISTS categorization_rules_lookup_idx ON public.categorization_rules(user_id, pattern);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorization_rules TO authenticated;
GRANT ALL ON public.categorization_rules TO service_role;

ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own categorization rules"
  ON public.categorization_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER categorization_rules_updated_at
  BEFORE UPDATE ON public.categorization_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();