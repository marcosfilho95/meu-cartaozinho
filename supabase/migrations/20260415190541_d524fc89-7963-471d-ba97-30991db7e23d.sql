
-- Delete corrupted/duplicate categories with encoding issues
DELETE FROM public.categories 
WHERE name LIKE '%Ã%' 
  OR name LIKE '%Â%'
  OR name LIKE '%§%';
