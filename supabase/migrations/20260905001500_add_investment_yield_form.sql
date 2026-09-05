ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS yield_form TEXT NOT NULL DEFAULT 'post_fixed'
  CHECK (yield_form IN ('post_fixed', 'pre_fixed', 'hybrid'));
