-- Add avatar support to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_id TEXT DEFAULT 'girl-spark';

-- Card subgroups (subcontas)
CREATE TABLE IF NOT EXISTS public.card_subgroups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_subgroups_user_card ON public.card_subgroups(user_id, card_id);

ALTER TABLE public.card_subgroups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'card_subgroups'
      AND policyname = 'Users manage own card subgroups'
  ) THEN
    CREATE POLICY "Users manage own card subgroups"
    ON public.card_subgroups
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Purchases now belong to a subgroup.
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS subgroup_id UUID REFERENCES public.card_subgroups(id) ON DELETE CASCADE;

UPDATE public.purchases
SET subgroup_id = NULL
WHERE subgroup_id IS NULL;

