
UPDATE public.transactions 
SET category_id = '9cc050aa-d81f-43d4-b198-6cbb2263ad82',
    source = CASE WHEN source = 'Cartão' THEN 'Nubank' ELSE source END
WHERE id = '4ad28f07-9372-4a17-b942-2bc5e7309d8e'
AND category_id IS NULL;
