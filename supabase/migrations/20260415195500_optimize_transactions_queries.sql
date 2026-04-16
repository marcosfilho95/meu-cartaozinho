-- Speed up core finance reads used by dashboard and transactions page.
create index if not exists idx_transactions_user_active_date
  on public.transactions (user_id, transaction_date desc)
  where deleted_at is null;

create index if not exists idx_transactions_user_active_status_date
  on public.transactions (user_id, status, transaction_date desc)
  where deleted_at is null;

