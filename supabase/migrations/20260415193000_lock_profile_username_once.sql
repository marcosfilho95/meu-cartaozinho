-- Lock username after first definition and normalize before save.
CREATE OR REPLACE FUNCTION public.lock_profile_username_once()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_username TEXT;
  new_username TEXT;
BEGIN
  old_username := NULLIF(LOWER(TRIM(COALESCE(OLD.username, ''))), '');
  new_username := NULLIF(LOWER(TRIM(COALESCE(NEW.username, ''))), '');

  -- Keep username normalized.
  NEW.username := new_username;

  -- If username was already defined once, it cannot change anymore.
  IF old_username IS NOT NULL AND new_username IS DISTINCT FROM old_username THEN
    RAISE EXCEPTION 'Username already defined and cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_profile_username_once ON public.profiles;
CREATE TRIGGER trg_lock_profile_username_once
BEFORE UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.lock_profile_username_once();

