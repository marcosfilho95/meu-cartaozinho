-- Idempotência de importação: nunca duplicar o mesmo lançamento
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_fingerprint_uidx
  ON public.transactions (user_id, fingerprint)
  WHERE deleted_at IS NULL AND fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external_id_uidx
  ON public.transactions (user_id, external_id)
  WHERE deleted_at IS NULL AND external_id IS NOT NULL;

-- Buscas de deduplicação / recorrência
CREATE INDEX IF NOT EXISTS transactions_dedup_lookup_idx
  ON public.transactions (user_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_installment_idx
  ON public.transactions (user_id, description_normalized, installment_total, installment_current)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_competence_idx
  ON public.transactions (user_id, competence_month)
  WHERE deleted_at IS NULL;

-- Um mesmo arquivo (hash) por usuário é sempre o mesmo registro
CREATE UNIQUE INDEX IF NOT EXISTS imported_files_user_hash_uidx
  ON public.imported_files (user_id, file_hash)
  WHERE file_hash <> '';