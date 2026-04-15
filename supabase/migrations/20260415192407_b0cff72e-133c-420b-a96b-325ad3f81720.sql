-- Fix orphaned credit card transactions that have no category
-- Assign them to the "Cartão" subcategory (under "Outros") as fallback
-- since we can't determine the original bank from the data
UPDATE public.transactions 
SET category_id = (
  SELECT c.id FROM public.categories c 
  WHERE c.user_id = transactions.user_id
  AND c.kind = 'expense'
  AND c.parent_id IS NOT NULL
  AND LOWER(c.name) = 'cartão'
  LIMIT 1
)
WHERE category_id IS NULL 
AND payment_method = 'credit'
AND type = 'expense'
AND deleted_at IS NULL;