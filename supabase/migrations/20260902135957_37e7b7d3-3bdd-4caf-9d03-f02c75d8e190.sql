-- Funções de negócio respeitam RLS e permissões do usuário chamador.
ALTER FUNCTION public.cache_financial_reference_rate(text, numeric, date, text, boolean) SECURITY INVOKER;
ALTER FUNCTION public.delete_goal_transaction(uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_username_available(text) SECURITY INVOKER;
ALTER FUNCTION public.reserve_goal_funds(uuid, uuid, numeric, text, text) SECURITY INVOKER;
ALTER FUNCTION public.update_goal_transaction(uuid, numeric, text, text) SECURITY INVOKER;

-- Função usada apenas por gatilhos: não deve ser chamada via Data API.
REVOKE EXECUTE ON FUNCTION public.sync_goal_amount_from_transactions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_goal_amount_from_transactions() TO service_role;

-- O trigger de criação de perfil continua sendo o único chamador público indireto.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;