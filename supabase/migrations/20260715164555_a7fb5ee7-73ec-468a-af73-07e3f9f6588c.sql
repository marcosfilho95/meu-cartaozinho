-- Lock down EXECUTE on SECURITY DEFINER functions to prevent public/anon abuse.
-- Trigger-only functions: no direct API caller ever needs EXECUTE.
REVOKE ALL ON FUNCTION public.normalize_category_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Bootstrap helpers: only signed-in users may run them; the internal auth.uid() check already scopes to self.
REVOKE ALL ON FUNCTION public.create_default_accounts_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_default_accounts_for_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_default_categories_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_default_categories_for_user(uuid) TO authenticated;

-- Username -> email resolver runs during login, so anon must keep EXECUTE. Restrict PUBLIC and keep the two API roles.
REVOKE ALL ON FUNCTION public.get_login_email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_login_email_by_username(text) TO anon, authenticated;