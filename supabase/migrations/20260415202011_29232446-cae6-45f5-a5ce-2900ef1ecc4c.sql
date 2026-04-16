
-- Re-grant anon access since login flow requires it pre-authentication
GRANT EXECUTE ON FUNCTION public.get_login_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_login_email_by_username(text) TO authenticated;
