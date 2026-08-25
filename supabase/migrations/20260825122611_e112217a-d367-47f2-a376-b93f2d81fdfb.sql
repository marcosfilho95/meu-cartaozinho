create or replace function public.confirm_financial_import(
  p_file jsonb,
  p_import jsonb,
  p_transactions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_file_id uuid;
  v_import_id uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_tx jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  insert into public.imported_files (
    user_id, file_name, file_hash, file_size, mime_type,
    detected_format, institution, document_type, stored_original, metadata
  ) values (
    v_user,
    coalesce(p_file->>'file_name', 'arquivo'),
    coalesce(p_file->>'file_hash', ''),
    nullif(p_file->>'file_size', '')::bigint,
    p_file->>'mime_type',
    p_file->>'detected_format',
    p_file->>'institution',
    p_file->>'document_type',
    coalesce((p_file->>'stored_original')::boolean, false),
    coalesce(p_file->'metadata', '{}'::jsonb)
  )
  returning id into v_file_id;

  insert into public.imports (
    user_id, imported_file_id, status, institution, document_type,
    parser_name, transactions_total, duplicates_total, confirmed_at, metadata
  ) values (
    v_user,
    v_file_id,
    coalesce(p_import->>'status', 'confirmed'),
    p_import->>'institution',
    p_import->>'document_type',
    p_import->>'parser_name',
    0,
    0,
    now(),
    coalesce(p_import->'metadata', '{}'::jsonb)
  )
  returning id into v_import_id;

  for v_tx in select value from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb))
  loop
    if exists (
      select 1
      from public.transactions t
      where t.user_id = v_user
        and t.deleted_at is null
        and (
          (nullif(v_tx->>'external_id', '') is not null and t.external_id = v_tx->>'external_id')
          or (nullif(v_tx->>'fingerprint', '') is not null and t.fingerprint = v_tx->>'fingerprint')
        )
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.transactions (
      user_id, account_id, category_id, type, amount, transaction_date,
      purchase_date, due_date, status, source, notes, payment_method,
      is_reviewed, is_reconciled, external_id, fingerprint, source_origin,
      description_original, description_normalized, merchant_name,
      installment_current, installment_total, possible_duplicate,
      possible_internal_transfer, competence_month, statement_month,
      transaction_role, institution, card_last4, metadata,
      import_id, imported_file_id
    ) values (
      v_user,
      (v_tx->>'account_id')::uuid,
      nullif(v_tx->>'category_id', '')::uuid,
      (v_tx->>'type')::transaction_type,
      (v_tx->>'amount')::numeric,
      (v_tx->>'transaction_date')::date,
      nullif(v_tx->>'purchase_date', '')::date,
      nullif(v_tx->>'due_date', '')::date,
      coalesce(nullif(v_tx->>'status', ''), 'paid')::transaction_status,
      v_tx->>'source',
      v_tx->>'notes',
      v_tx->>'payment_method',
      coalesce((v_tx->>'is_reviewed')::boolean, false),
      coalesce((v_tx->>'is_reconciled')::boolean, false),
      nullif(v_tx->>'external_id', ''),
      nullif(v_tx->>'fingerprint', ''),
      coalesce(v_tx->>'source_origin', 'import'),
      v_tx->>'description_original',
      v_tx->>'description_normalized',
      v_tx->>'merchant_name',
      nullif(v_tx->>'installment_current', '')::integer,
      nullif(v_tx->>'installment_total', '')::integer,
      coalesce((v_tx->>'possible_duplicate')::boolean, false),
      coalesce((v_tx->>'possible_internal_transfer')::boolean, false),
      v_tx->>'competence_month',
      v_tx->>'statement_month',
      v_tx->>'transaction_role',
      v_tx->>'institution',
      v_tx->>'card_last4',
      coalesce(v_tx->'metadata', '{}'::jsonb),
      v_import_id,
      v_file_id
    );
    v_inserted := v_inserted + 1;
  end loop;

  update public.imports
  set transactions_total = v_inserted,
      duplicates_total = v_skipped + coalesce(nullif(p_import->>'duplicates_total', '')::integer, 0)
  where id = v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'imported_file_id', v_file_id,
    'transactions_total', v_inserted,
    'duplicates_skipped', v_skipped
  );
end;
$$;

revoke all on function public.confirm_financial_import(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_financial_import(jsonb, jsonb, jsonb) to authenticated;