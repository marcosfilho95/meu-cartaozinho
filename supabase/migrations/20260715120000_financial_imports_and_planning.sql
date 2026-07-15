-- Financial imports, review metadata, planning and members.
-- Additive migration: does not remove or rewrite existing user data.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS description_original TEXT,
  ADD COLUMN IF NOT EXISTS description_normalized TEXT,
  ADD COLUMN IF NOT EXISTS merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source_origin TEXT,
  ADD COLUMN IF NOT EXISTS import_id UUID,
  ADD COLUMN IF NOT EXISTS imported_file_id UUID,
  ADD COLUMN IF NOT EXISTS installment_current INTEGER,
  ADD COLUMN IF NOT EXISTS installment_total INTEGER,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS possible_duplicate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS possible_internal_transfer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_transactions_user_external_id
  ON public.transactions(user_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_fingerprint
  ON public.transactions(user_id, fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_due_status
  ON public.transactions(user_id, due_date, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.imported_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  detected_format TEXT,
  institution TEXT,
  document_type TEXT,
  stored_original BOOLEAN NOT NULL DEFAULT false,
  storage_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_hash)
);

ALTER TABLE public.imported_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imported_files'
      AND policyname = 'Users manage own imported files'
  ) THEN
    CREATE POLICY "Users manage own imported files"
      ON public.imported_files
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_imported_files_user_created
  ON public.imported_files(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  imported_file_id UUID REFERENCES public.imported_files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'reviewing'
    CHECK (status IN ('reviewing', 'confirmed', 'canceled', 'failed')),
  institution TEXT,
  document_type TEXT,
  parser_name TEXT,
  transactions_total INTEGER NOT NULL DEFAULT 0,
  duplicates_total INTEGER NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'imports'
      AND policyname = 'Users manage own imports'
  ) THEN
    CREATE POLICY "Users manage own imports"
      ON public.imports
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_imports_user_created
  ON public.imports(user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_import_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_import_id_fkey
      FOREIGN KEY (import_id)
      REFERENCES public.imports(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_imported_file_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_imported_file_id_fkey
      FOREIGN KEY (imported_file_id)
      REFERENCES public.imported_files(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_type IN ('contains', 'starts_with', 'equals', 'regex')),
  pattern TEXT NOT NULL,
  merchant_name TEXT,
  min_amount NUMERIC,
  max_amount NUMERIC,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  direction TEXT CHECK (direction IN ('CREDIT', 'DEBIT')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'categorization_rules'
      AND policyname = 'Users manage own categorization rules'
  ) THEN
    CREATE POLICY "Users manage own categorization rules"
      ON public.categorization_rules
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_categorization_rules_user_active
  ON public.categorization_rules(user_id, is_active, priority);

CREATE TABLE IF NOT EXISTS public.internal_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  outgoing_transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  incoming_transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  confidence NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'internal_transfers'
      AND policyname = 'Users manage own internal transfers'
  ) THEN
    CREATE POLICY "Users manage own internal transfers"
      ON public.internal_transfers
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.expected_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recurrence_id UUID REFERENCES public.recurrences(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC,
  expected_min_amount NUMERIC,
  expected_max_amount NUMERIC,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected', 'pending', 'paid', 'overdue', 'ignored', 'canceled')),
  confidence NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expected_bills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expected_bills'
      AND policyname = 'Users manage own expected bills'
  ) THEN
    CREATE POLICY "Users manage own expected bills"
      ON public.expected_bills
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_expected_bills_user_due_status
  ON public.expected_bills(user_id, due_date, status);

CREATE TABLE IF NOT EXISTS public.members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'members'
      AND policyname = 'Users manage own members'
  ) THEN
    CREATE POLICY "Users manage own members"
      ON public.members
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.transaction_members (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  percentage NUMERIC NOT NULL DEFAULT 100,
  PRIMARY KEY (transaction_id, member_id)
);

ALTER TABLE public.transaction_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transaction_members'
      AND policyname = 'Users manage own transaction members'
  ) THEN
    CREATE POLICY "Users manage own transaction members"
      ON public.transaction_members
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.id = transaction_id
            AND t.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.transactions t
          WHERE t.id = transaction_id
            AND t.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Users view own audit logs'
  ) THEN
    CREATE POLICY "Users view own audit logs"
      ON public.audit_logs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Users insert own audit logs'
  ) THEN
    CREATE POLICY "Users insert own audit logs"
      ON public.audit_logs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs(user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_categorization_rules_updated_at'
  ) THEN
    CREATE TRIGGER trg_categorization_rules_updated_at
      BEFORE UPDATE ON public.categorization_rules
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_expected_bills_updated_at'
  ) THEN
    CREATE TRIGGER trg_expected_bills_updated_at
      BEFORE UPDATE ON public.expected_bills
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;
