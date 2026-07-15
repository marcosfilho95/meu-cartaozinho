-- Imported files: physical uploads (dedup by user + hash)
CREATE TABLE IF NOT EXISTS public.imported_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  detected_format TEXT,
  institution TEXT,
  document_type TEXT,
  stored_original BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_files TO authenticated;
GRANT ALL ON public.imported_files TO service_role;

ALTER TABLE public.imported_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own imported files"
  ON public.imported_files FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER imported_files_updated_at
  BEFORE UPDATE ON public.imported_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Imports: each parse/confirm attempt
CREATE TABLE IF NOT EXISTS public.imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imported_file_id UUID REFERENCES public.imported_files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'confirmed', 'cancelled', 'failed')),
  institution TEXT,
  document_type TEXT,
  parser_name TEXT,
  transactions_total INTEGER NOT NULL DEFAULT 0,
  duplicates_total INTEGER NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS imports_user_idx ON public.imports(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own imports"
  ON public.imports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER imports_updated_at
  BEFORE UPDATE ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Transactions: import-related columns for dedup/traceability
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_fingerprint_idx ON public.transactions(user_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_external_idx ON public.transactions(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_import_idx ON public.transactions(import_id) WHERE import_id IS NOT NULL;