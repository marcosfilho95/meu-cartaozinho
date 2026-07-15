-- Remove the email-leaking lookup function (accessible pre-auth)
DROP FUNCTION IF EXISTS public.get_login_email_by_username(text);

-- Boolean-only replacement for username availability checks (signup / profile edit)
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;