-- Convert bootstrap helpers from SECURITY DEFINER to SECURITY INVOKER.
-- They insert only into rows scoped to auth.uid(), and the target tables have
-- owner-scoped RLS policies, so the invoker's own privileges are sufficient.
ALTER FUNCTION public.create_default_accounts_for_user(uuid) SECURITY INVOKER;
ALTER FUNCTION public.create_default_categories_for_user(uuid) SECURITY INVOKER;