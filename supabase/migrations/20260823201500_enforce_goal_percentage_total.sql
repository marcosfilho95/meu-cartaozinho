CREATE OR REPLACE FUNCTION public.validate_goal_percentage_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  checkpoint_month TEXT;
  percentage_total NUMERIC;
BEGIN
  IF NEW.goal_id IS NULL OR NEW.value_type <> 'percentage' THEN
    RETURN NEW;
  END IF;

  FOR checkpoint_month IN
    SELECT NEW.effective_month
    UNION
    SELECT DISTINCT effective_month
    FROM public.financial_rule_versions
    WHERE user_id = NEW.user_id
      AND effective_month >= NEW.effective_month
  LOOP
    WITH candidates AS (
      SELECT rule_key, goal_id, value_type, value, effective_month, created_at, id
      FROM public.financial_rule_versions
      WHERE user_id = NEW.user_id
      UNION ALL
      SELECT NEW.rule_key, NEW.goal_id, NEW.value_type, NEW.value,
             NEW.effective_month, COALESCE(NEW.created_at, now()), NEW.id
    ), effective_rules AS (
      SELECT DISTINCT ON (rule_key)
        rule_key, goal_id, value_type, value
      FROM candidates
      WHERE effective_month <= checkpoint_month
      ORDER BY rule_key, effective_month DESC, created_at DESC, id DESC
    )
    SELECT COALESCE(SUM(value), 0)
    INTO percentage_total
    FROM effective_rules
    WHERE goal_id IS NOT NULL AND value_type = 'percentage';

    IF percentage_total > 100 THEN
      RAISE EXCEPTION 'A soma dos percentuais dos planos seria % em %. O limite é 100%%.',
        percentage_total, checkpoint_month
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_goal_percentage_total ON public.financial_rule_versions;
CREATE TRIGGER trg_validate_goal_percentage_total
  BEFORE INSERT ON public.financial_rule_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_goal_percentage_total();
