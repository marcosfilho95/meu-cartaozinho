
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON public.transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_deleted ON public.transactions (user_id, deleted_at) WHERE deleted_at IS NULL;
