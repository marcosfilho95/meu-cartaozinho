-- Preserve every financial date and confirm an import in one database transaction.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS posting_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transactions_user_external_id
  ON public.transactions(user_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.confirm_financial_import(
  p_file JSONB,
  p_import JSONB,
  p_transactions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_file_id UUID;
  v_import_id UUID;
  v_transaction JSONB;
  v_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF jsonb_typeof(p_transactions) <> 'array' OR jsonb_array_length(p_transactions) = 0 THEN
    RAISE EXCEPTION 'Nenhuma transação para importar';
  END IF;

  INSERT INTO public.imported_files (
    user_id, file_name, file_hash, file_size, mime_type, detected_format,
    institution, document_type, stored_original, metadata
  ) VALUES (
    v_user_id,
    p_file->>'file_name',
    p_file->>'file_hash',
    NULLIF(p_file->>'file_size', '')::BIGINT,
    NULLIF(p_file->>'mime_type', ''),
    NULLIF(p_file->>'detected_format', ''),
    NULLIF(p_file->>'institution', ''),
    NULLIF(p_file->>'document_type', ''),
    COALESCE((p_file->>'stored_original')::BOOLEAN, false),
    COALESCE(p_file->'metadata', '{}'::JSONB)
  )
  ON CONFLICT (user_id, file_hash) DO UPDATE SET
    file_name = EXCLUDED.file_name,
    file_size = EXCLUDED.file_size,
    mime_type = EXCLUDED.mime_type,
    detected_format = EXCLUDED.detected_format,
    institution = EXCLUDED.institution,
    document_type = EXCLUDED.document_type,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_file_id;

  INSERT INTO public.imports (
    user_id, imported_file_id, status, institution, document_type,
    parser_name, transactions_total, duplicates_total, confirmed_at, metadata
  ) VALUES (
    v_user_id,
    v_file_id,
    COALESCE(NULLIF(p_import->>'status', ''), 'confirmed'),
    NULLIF(p_import->>'institution', ''),
    NULLIF(p_import->>'document_type', ''),
    NULLIF(p_import->>'parser_name', ''),
    jsonb_array_length(p_transactions),
    COALESCE((p_import->>'duplicates_total')::INTEGER, 0),
    now(),
    COALESCE(p_import->'metadata', '{}'::JSONB)
  ) RETURNING id INTO v_import_id;

  FOR v_transaction IN SELECT value FROM jsonb_array_elements(p_transactions)
  LOOP
    INSERT INTO public.transactions (
      user_id, account_id, category_id, counterpart_account_id, type, amount,
      transaction_date, purchase_date, posting_date, due_date, paid_at, status,
      source, notes, payment_method, is_reviewed, is_reconciled, external_id,
      fingerprint, import_id, imported_file_id, source_origin,
      description_original, description_normalized, merchant_name,
      installment_current, installment_total, possible_duplicate,
      possible_internal_transfer, competence_month, statement_month,
      transaction_role, institution, card_last4, metadata
    ) VALUES (
      v_user_id,
      (v_transaction->>'account_id')::UUID,
      NULLIF(v_transaction->>'category_id', '')::UUID,
      NULLIF(v_transaction->>'counterpart_account_id', '')::UUID,
      (v_transaction->>'type')::public.transaction_type,
      (v_transaction->>'amount')::NUMERIC,
      (v_transaction->>'transaction_date')::DATE,
      NULLIF(v_transaction->>'purchase_date', '')::DATE,
      NULLIF(v_transaction->>'posting_date', '')::DATE,
      NULLIF(v_transaction->>'due_date', '')::DATE,
      NULLIF(v_transaction->>'paid_at', '')::TIMESTAMPTZ,
      COALESCE(NULLIF(v_transaction->>'status', ''), 'pending')::public.transaction_status,
      NULLIF(v_transaction->>'source', ''),
      NULLIF(v_transaction->>'notes', ''),
      NULLIF(v_transaction->>'payment_method', ''),
      COALESCE((v_transaction->>'is_reviewed')::BOOLEAN, false),
      COALESCE((v_transaction->>'is_reconciled')::BOOLEAN, false),
      NULLIF(v_transaction->>'external_id', ''),
      NULLIF(v_transaction->>'fingerprint', ''),
      v_import_id,
      v_file_id,
      COALESCE(NULLIF(v_transaction->>'source_origin', ''), 'import'),
      NULLIF(v_transaction->>'description_original', ''),
      NULLIF(v_transaction->>'description_normalized', ''),
      NULLIF(v_transaction->>'merchant_name', ''),
      NULLIF(v_transaction->>'installment_current', '')::INTEGER,
      NULLIF(v_transaction->>'installment_total', '')::INTEGER,
      COALESCE((v_transaction->>'possible_duplicate')::BOOLEAN, false),
      COALESCE((v_transaction->>'possible_internal_transfer')::BOOLEAN, false),
      NULLIF(v_transaction->>'competence_month', ''),
      NULLIF(v_transaction->>'statement_month', ''),
      NULLIF(v_transaction->>'transaction_role', ''),
      NULLIF(v_transaction->>'institution', ''),
      NULLIF(v_transaction->>'card_last4', ''),
      COALESCE(v_transaction->'metadata', '{}'::JSONB)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('import_id', v_import_id, 'imported_file_id', v_file_id, 'transactions_total', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_financial_import(JSONB, JSONB, JSONB) TO authenticated;
