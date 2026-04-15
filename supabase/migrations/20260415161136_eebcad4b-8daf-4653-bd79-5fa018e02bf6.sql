-- Add normalized_name column
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS normalized_name text;

-- Create normalization function
CREATE OR REPLACE FUNCTION public.normalize_category_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.normalized_name := lower(translate(trim(NEW.name), 'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucaaaaeeiooouuc'));
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_normalized_category_name
BEFORE INSERT OR UPDATE OF name ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.normalize_category_name();

-- Populate existing rows
UPDATE public.categories
SET normalized_name = lower(translate(trim(name), 'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucaaaaeeiooouuc'))
WHERE normalized_name IS NULL;

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_normalized
ON public.categories (user_id, kind, normalized_name);