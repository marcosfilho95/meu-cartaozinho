-- Add the Carro default without overriding user-created categories and harden budgets.

CREATE OR REPLACE FUNCTION public.ensure_default_categories_for_user_internal(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_transport uuid;
BEGIN
  -- Preserve the current first-use seed for accounts with no categories.
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = p_user_id LIMIT 1) THEN
    INSERT INTO public.categories (user_id, name, kind, icon, color, is_system) VALUES
      (p_user_id, 'Alimentação', 'expense', 'utensils', '#FF6B6B', true),
      (p_user_id, 'Transporte', 'expense', 'car', '#4ECDC4', true),
      (p_user_id, 'Moradia', 'expense', 'home', '#45B7D1', true),
      (p_user_id, 'Saúde', 'expense', 'heart', '#96CEB4', true),
      (p_user_id, 'Educação', 'expense', 'book-open', '#FFEAA7', true),
      (p_user_id, 'Lazer', 'expense', 'gamepad-2', '#DDA0DD', true),
      (p_user_id, 'Outros', 'expense', 'ellipsis', '#AEB6BF', true),
      (p_user_id, 'Salário', 'income', 'banknote', '#2ECC71', true),
      (p_user_id, 'Investimentos', 'income', 'trending-up', '#1ABC9C', true),
      (p_user_id, 'Transferência', 'transfer', 'arrow-right-left', '#85929E', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Name + kind is the database identity; parent_id is intentionally not part of it.
  INSERT INTO public.categories (user_id, name, kind, icon, color, is_system)
  SELECT p_user_id, 'Transporte', 'expense', 'car', '#F0A030', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.user_id = p_user_id
      AND c.kind = 'expense'
      AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'transporte'
  )
  ON CONFLICT DO NOTHING;

  SELECT c.id
  INTO v_transport
  FROM public.categories c
  WHERE c.user_id = p_user_id
    AND c.kind = 'expense'
    AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'transporte'
  ORDER BY (c.parent_id IS NULL) DESC, c.created_at, c.id
  LIMIT 1;

  IF v_transport IS NOT NULL THEN
    INSERT INTO public.categories (user_id, name, kind, parent_id, icon, color, is_system)
    SELECT p_user_id, 'Carro', 'expense', v_transport, 'car', '#64748B', true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.categories c
      WHERE c.user_id = p_user_id
        AND c.kind = 'expense'
        AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'carro'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_categories_for_user_internal(uuid)
  FROM PUBLIC, anon, authenticated;

-- Signed-in callers may bootstrap only their own categories. The privileged
-- implementation is not exposed directly to API roles.
CREATE OR REPLACE FUNCTION public.create_default_categories_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_default_categories_for_user_internal(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_categories_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_default_categories_for_user(uuid) TO authenticated;

-- auth.users is written by supabase_auth_admin, not by the authenticated API role.
-- Both entry points use the private implementation; the API entry point first
-- verifies auth.uid(), while this trigger receives the newly-created user id.
CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_default_categories_for_user_internal(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_categories() FROM PUBLIC, anon, authenticated;

-- Ensure every existing user has Transporte, while preserving any category with that name.
INSERT INTO public.categories (user_id, name, kind, icon, color, is_system)
SELECT u.id, 'Transporte', 'expense', 'car', '#F0A030', true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE c.user_id = u.id
    AND c.kind = 'expense'
    AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'transporte'
)
ON CONFLICT DO NOTHING;

-- Backfill Carro under the preferred Transporte. An existing custom Carro wins unchanged.
WITH transport_by_user AS (
  SELECT DISTINCT ON (c.user_id)
    c.user_id,
    c.id AS transport_id
  FROM public.categories c
  WHERE c.kind = 'expense'
    AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'transporte'
  ORDER BY c.user_id, (c.parent_id IS NULL) DESC, c.created_at, c.id
)
INSERT INTO public.categories (user_id, name, kind, parent_id, icon, color, is_system)
SELECT t.user_id, 'Carro', 'expense', t.transport_id, 'car', '#64748B', true
FROM transport_by_user t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE c.user_id = t.user_id
    AND c.kind = 'expense'
    AND COALESCE(c.normalized_name, lower(trim(c.name))) = 'carro'
)
ON CONFLICT DO NOTHING;

LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

-- Repair legacy hierarchy links before interpreting parent/child budgets. A
-- category may only point to a different category of the same user and kind.
UPDATE public.categories child
SET parent_id = NULL
WHERE child.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.categories parent
    WHERE parent.id = child.parent_id
      AND parent.user_id = child.user_id
      AND parent.kind = child.kind
      AND parent.id <> child.id
  );

-- Break every remaining cycle deterministically by promoting its members to
-- roots. UNION (rather than UNION ALL) makes the walk finite even on bad data.
WITH RECURSIVE category_ancestors AS (
  SELECT c.user_id, c.id AS descendant_id, c.parent_id AS ancestor_id
  FROM public.categories c
  WHERE c.parent_id IS NOT NULL

  UNION

  SELECT chain.user_id, chain.descendant_id, parent.parent_id AS ancestor_id
  FROM category_ancestors chain
  JOIN public.categories parent
    ON parent.id = chain.ancestor_id
   AND parent.user_id = chain.user_id
  WHERE parent.parent_id IS NOT NULL
), cyclic_categories AS (
  SELECT DISTINCT descendant_id AS id
  FROM category_ancestors
  WHERE descendant_id = ancestor_id
)
UPDATE public.categories category
SET parent_id = NULL
FROM cyclic_categories cyclic
WHERE category.id = cyclic.id;

-- Serialize the one-time cleanup and preserve every removed row for recovery.
LOCK TABLE public.budgets IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.budget_cleanup_archive_20260715 (
  budget_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  cleanup_reason text NOT NULL,
  original_row jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_cleanup_archive_20260715 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own archived budgets" ON public.budget_cleanup_archive_20260715;
CREATE POLICY "Users view own archived budgets"
  ON public.budget_cleanup_archive_20260715
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.budget_cleanup_archive_20260715 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.budget_cleanup_archive_20260715 TO authenticated;

-- Normalize recoverable legacy month keys before validating the format.
UPDATE public.budgets
SET ref_month = split_part(ref_month, '-', 1) || '-' || lpad(split_part(ref_month, '-', 2), 2, '0')
WHERE ref_month ~ '^[0-9]{4}-(0?[1-9]|1[0-2])$';

UPDATE public.budgets
SET alert_threshold_pct = 80
WHERE alert_threshold_pct < 0 OR alert_threshold_pct > 100;

-- Rows with no usable category, amount or month cannot represent an active budget.
WITH invalid_budgets AS (
  SELECT
    b.id AS budget_id,
    b.user_id,
    CASE
      WHEN b.category_id IS NULL THEN 'missing_category'
      WHEN b.limit_amount IS NULL THEN 'missing_limit'
      WHEN b.limit_amount = 'NaN'::numeric THEN 'nan_limit'
      WHEN b.limit_amount <= 0 THEN 'non_positive_limit'
      WHEN b.ref_month IS NULL THEN 'missing_ref_month'
      WHEN b.ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN 'invalid_ref_month'
      ELSE 'category_owner_or_kind_mismatch'
    END AS cleanup_reason,
    to_jsonb(b) AS original_row
  FROM public.budgets b
  WHERE b.category_id IS NULL
     OR b.limit_amount IS NULL
     OR b.limit_amount <= 0
     OR b.limit_amount = 'NaN'::numeric
     OR b.ref_month IS NULL
     OR b.ref_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR NOT EXISTS (
       SELECT 1
       FROM public.categories c
       WHERE c.id = b.category_id
         AND c.user_id = b.user_id
         AND c.kind = 'expense'
     )
), archived AS (
  INSERT INTO public.budget_cleanup_archive_20260715 (
    budget_id,
    user_id,
    cleanup_reason,
    original_row
  )
  SELECT budget_id, user_id, cleanup_reason, original_row
  FROM invalid_budgets
  ON CONFLICT (budget_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        cleanup_reason = EXCLUDED.cleanup_reason,
        original_row = EXCLUDED.original_row,
        archived_at = now()
  RETURNING budget_id
)
DELETE FROM public.budgets b
USING archived
WHERE b.id = archived.budget_id;

-- Keep the most recently created valid budget for each exact category/month.
WITH ranked_budgets AS (
  SELECT
    b.id,
    row_number() OVER (
      PARTITION BY b.user_id, b.category_id, b.ref_month
      ORDER BY b.created_at DESC, b.id DESC
    ) AS row_rank
  FROM public.budgets b
), duplicate_budgets AS (
  SELECT
    b.id AS budget_id,
    b.user_id,
    'duplicate_user_category_month'::text AS cleanup_reason,
    to_jsonb(b) AS original_row
  FROM public.budgets b
  JOIN ranked_budgets ranked ON ranked.id = b.id
  WHERE ranked.row_rank > 1
), archived AS (
  INSERT INTO public.budget_cleanup_archive_20260715 (
    budget_id,
    user_id,
    cleanup_reason,
    original_row
  )
  SELECT budget_id, user_id, cleanup_reason, original_row
  FROM duplicate_budgets
  ON CONFLICT (budget_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        cleanup_reason = EXCLUDED.cleanup_reason,
        original_row = EXCLUDED.original_row,
        archived_at = now()
  RETURNING budget_id
)
DELETE FROM public.budgets b
USING archived
WHERE b.id = archived.budget_id;

-- Parent budgets now roll up descendant spending. If legacy rows budget both
-- levels, retain the more specific descendant rows and archive their ancestors.
WITH RECURSIVE category_ancestors AS (
  SELECT c.user_id, c.id AS descendant_id, c.parent_id AS ancestor_id
  FROM public.categories c
  WHERE c.parent_id IS NOT NULL

  UNION

  SELECT chain.user_id, chain.descendant_id, parent.parent_id AS ancestor_id
  FROM category_ancestors chain
  JOIN public.categories parent
    ON parent.id = chain.ancestor_id
   AND parent.user_id = chain.user_id
  WHERE parent.parent_id IS NOT NULL
), overlapping_parent_budgets AS (
  SELECT DISTINCT parent_budget.id AS budget_id
  FROM category_ancestors chain
  JOIN public.budgets parent_budget
    ON parent_budget.user_id = chain.user_id
   AND parent_budget.category_id = chain.ancestor_id
  JOIN public.budgets descendant_budget
    ON descendant_budget.user_id = parent_budget.user_id
   AND descendant_budget.ref_month = parent_budget.ref_month
   AND descendant_budget.category_id = chain.descendant_id
), overlap_rows AS (
  SELECT
    b.id AS budget_id,
    b.user_id,
    'overlapping_parent_budget'::text AS cleanup_reason,
    to_jsonb(b) AS original_row
  FROM public.budgets b
  JOIN overlapping_parent_budgets overlap ON overlap.budget_id = b.id
), archived AS (
  INSERT INTO public.budget_cleanup_archive_20260715 (
    budget_id,
    user_id,
    cleanup_reason,
    original_row
  )
  SELECT budget_id, user_id, cleanup_reason, original_row
  FROM overlap_rows
  ON CONFLICT (budget_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        cleanup_reason = EXCLUDED.cleanup_reason,
        original_row = EXCLUDED.original_row,
        archived_at = now()
  RETURNING budget_id
)
DELETE FROM public.budgets b
USING archived
WHERE b.id = archived.budget_id;

ALTER TABLE public.budgets
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN category_id SET NOT NULL,
  ALTER COLUMN ref_month SET NOT NULL,
  ALTER COLUMN limit_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_limit_amount_positive'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_limit_amount_positive
      CHECK (limit_amount > 0 AND limit_amount <> 'NaN'::numeric);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_ref_month_format'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_ref_month_format
      CHECK (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_alert_threshold_range'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_alert_threshold_range
      CHECK (alert_threshold_pct BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_user_category_month_key'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_user_category_month_key
      UNIQUE (user_id, category_id, ref_month);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'categories_id_user_id_key'
      AND conrelid = 'public.categories'::regclass
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_id_user_id_key UNIQUE (id, user_id);
  END IF;

  ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_category_id_fkey;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_category_user_fkey'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_category_user_fkey
      FOREIGN KEY (category_id, user_id)
      REFERENCES public.categories (id, user_id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

-- Enforce expense-only categories and prevent overlapping ancestor/descendant
-- budgets. The advisory lock closes the two-tab race for the same user/month.
CREATE OR REPLACE FUNCTION public.validate_budget_category_and_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('budget-hierarchy:' || NEW.user_id::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || NEW.ref_month, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.id = NEW.category_id
      AND c.user_id = NEW.user_id
      AND c.kind = 'expense'
  ) THEN
    RAISE EXCEPTION 'Budget category must be an expense category owned by the user'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT c.parent_id
      FROM public.categories c
      WHERE c.id = NEW.category_id
        AND c.user_id = NEW.user_id
        AND c.parent_id IS NOT NULL

      UNION

      SELECT c.parent_id
      FROM public.categories c
      JOIN ancestors parent ON parent.id = c.id
      WHERE c.user_id = NEW.user_id
        AND c.parent_id IS NOT NULL
    ), descendants(id) AS (
      SELECT c.id
      FROM public.categories c
      WHERE c.user_id = NEW.user_id
        AND c.parent_id = NEW.category_id

      UNION

      SELECT c.id
      FROM public.categories c
      JOIN descendants child ON c.parent_id = child.id
      WHERE c.user_id = NEW.user_id
    ), related_categories AS (
      SELECT id FROM ancestors
      UNION
      SELECT id FROM descendants
    )
    SELECT 1
    FROM public.budgets b
    WHERE b.user_id = NEW.user_id
      AND b.ref_month = NEW.ref_month
      AND b.id <> NEW.id
      AND b.category_id IN (SELECT id FROM related_categories)
  ) THEN
    RAISE EXCEPTION 'A parent or child category already has a budget for this month'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_budget_category_and_hierarchy()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_budget_category_and_hierarchy ON public.budgets;
CREATE TRIGGER validate_budget_category_and_hierarchy
  BEFORE INSERT OR UPDATE OF user_id, category_id, ref_month
  ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_budget_category_and_hierarchy();

-- Category edits can change budget ancestry after the budget rows were already
-- validated. Guard ownership, kind, cycles and any overlap introduced by a move.
CREATE OR REPLACE FUNCTION public.validate_category_hierarchy_and_budgets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A category cannot be transferred to another user'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('budget-hierarchy:' || NEW.user_id::text, 0)
  );

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A category cannot be its own parent'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.categories parent
      WHERE parent.id = NEW.parent_id
        AND parent.user_id = NEW.user_id
        AND parent.kind = NEW.kind
    ) THEN
      RAISE EXCEPTION 'Category parent must belong to the same user and kind'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT category.id, category.parent_id
        FROM public.categories category
        WHERE category.id = NEW.parent_id
          AND category.user_id = NEW.user_id

        UNION

        SELECT parent.id, parent.parent_id
        FROM public.categories parent
        JOIN ancestors child ON child.parent_id = parent.id
        WHERE parent.user_id = NEW.user_id
      )
      SELECT 1
      FROM ancestors
      WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Category hierarchy cannot contain a cycle'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.kind IS DISTINCT FROM OLD.kind THEN
    IF NEW.kind <> 'expense' AND EXISTS (
      SELECT 1
      FROM public.budgets budget
      WHERE budget.user_id = NEW.user_id
        AND budget.category_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A budgeted category must remain an expense category'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.categories child
      WHERE child.user_id = NEW.user_id
        AND child.parent_id = NEW.id
        AND child.kind <> NEW.kind
    ) THEN
      RAISE EXCEPTION 'Change or detach child categories before changing this kind'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF (
    TG_OP = 'UPDATE'
    AND NEW.parent_id IS DISTINCT FROM OLD.parent_id
    AND NEW.parent_id IS NOT NULL
    AND EXISTS (
      WITH RECURSIVE moving_categories(id) AS (
        SELECT NEW.id

        UNION

        SELECT child.id
        FROM public.categories child
        JOIN moving_categories moving ON child.parent_id = moving.id
        WHERE child.user_id = NEW.user_id
      ), new_ancestors(id) AS (
        SELECT NEW.parent_id

        UNION

        SELECT parent.parent_id
        FROM public.categories parent
        JOIN new_ancestors ancestor ON parent.id = ancestor.id
        WHERE parent.user_id = NEW.user_id
          AND parent.parent_id IS NOT NULL
      )
      SELECT 1
      FROM public.budgets moving_budget
      JOIN public.budgets ancestor_budget
        ON ancestor_budget.user_id = moving_budget.user_id
       AND ancestor_budget.ref_month = moving_budget.ref_month
      WHERE moving_budget.user_id = NEW.user_id
        AND moving_budget.category_id IN (SELECT id FROM moving_categories)
        AND ancestor_budget.category_id IN (SELECT id FROM new_ancestors)
    )
  ) THEN
    RAISE EXCEPTION 'This category move would overlap existing budgets'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_category_hierarchy_and_budgets()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_category_hierarchy_and_budgets ON public.categories;
CREATE TRIGGER validate_category_hierarchy_and_budgets
  BEFORE INSERT OR UPDATE OF user_id, parent_id, kind
  ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_category_hierarchy_and_budgets();
