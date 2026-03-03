-- Add username support for login
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_username_format_chk'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_format_chk
    CHECK (
      username IS NULL
      OR username ~ '^[a-z0-9._-]{3,20}$'
    );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uniq
ON public.profiles (LOWER(username))
WHERE username IS NOT NULL;

-- Keep automatic profile creation, now with optional username from auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_username TEXT;
  normalized_username TEXT;
BEGIN
  raw_username := LOWER(COALESCE(NEW.raw_user_meta_data->>'username', ''));
  normalized_username := regexp_replace(raw_username, '[^a-z0-9._-]', '', 'g');

  IF length(normalized_username) < 3 OR length(normalized_username) > 20 THEN
    normalized_username := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    normalized_username
  );

  RETURN NEW;
END;
$$;

-- Resolve login username to auth email (needed for Supabase password login API).
CREATE OR REPLACE FUNCTION public.get_login_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.email::text
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.user_id
  WHERE LOWER(p.username) = LOWER(TRIM(p_username))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_email_by_username(TEXT) TO anon, authenticated;
