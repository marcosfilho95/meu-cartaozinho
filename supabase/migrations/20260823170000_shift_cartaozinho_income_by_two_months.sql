-- O saldo mensal do Meu Cartãozinho é recebido dois meses depois no Organizador.
-- Exemplo: parcelas de 2026-05 viram receita com competência em 2026-07.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS competence_month TEXT;

-- A integração passa a valer somente para meses de origem a partir de maio/2026.
-- Linhas automáticas anteriores são ocultadas por soft delete, mantendo auditoria.
UPDATE public.transactions
SET deleted_at = COALESCE(deleted_at, now())
WHERE external_id LIKE 'meu_cartaozinho:%'
  AND substring(external_id FROM 17) < '2026-05';

WITH mapped AS (
  SELECT
    id,
    substring(external_id FROM 17) AS source_month,
    (to_date(substring(external_id FROM 17) || '-01', 'YYYY-MM-DD') + interval '2 months')::date AS receipt_date
  FROM public.transactions
  WHERE external_id ~ '^meu_cartaozinho:[0-9]{4}-(0[1-9]|1[0-2])$'
    AND substring(external_id FROM 17) >= '2026-05'
)
UPDATE public.transactions AS transaction
SET
  transaction_date = mapped.receipt_date,
  competence_month = to_char(mapped.receipt_date, 'YYYY-MM'),
  due_date = mapped.receipt_date,
  description_original = 'Meu Cartãozinho — ' || mapped.source_month || ' · recebido em ' || to_char(mapped.receipt_date, 'YYYY-MM'),
  notes = 'Meu Cartãozinho — ' || mapped.source_month || ' · recebido em ' || to_char(mapped.receipt_date, 'YYYY-MM'),
  metadata = COALESCE(transaction.metadata, '{}'::jsonb) || jsonb_build_object(
    'integration', 'meu_cartaozinho',
    'source_month', mapped.source_month,
    'receipt_month', to_char(mapped.receipt_date, 'YYYY-MM')
  )
FROM mapped
WHERE transaction.id = mapped.id;
