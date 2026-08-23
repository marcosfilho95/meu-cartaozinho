-- Impede duplicação das linhas automáticas criadas pelo fechamento mensal.
-- O índice é restrito às integrações novas e não interfere em imports antigos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_monthly_automation_unique
  ON public.transactions(user_id, external_id)
  WHERE deleted_at IS NULL
    AND external_id IS NOT NULL
    AND (
      external_id LIKE 'meu_cartaozinho:%'
      OR external_id LIKE 'fixed_bill:%'
    );
