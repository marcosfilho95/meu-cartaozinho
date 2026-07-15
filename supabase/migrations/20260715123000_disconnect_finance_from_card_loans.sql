-- Disconnect the personal finance organizer from Meu Cartaozinho.
-- Rows created by the old automatic card-loan sync are soft-deleted so they
-- no longer affect personal dashboards, budgets, reports or pending bills.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_origin TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.transactions
SET
  deleted_at = COALESCE(deleted_at, now()),
  source_origin = COALESCE(source_origin, 'meu_cartaozinho_sync'),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'disconnectedFromPersonalFinanceAt', now(),
    'reason', 'Meu Cartaozinho tracks card loans, not personal spending'
  )
WHERE notes LIKE 'mc_sync_installment:%'
  AND deleted_at IS NULL;

