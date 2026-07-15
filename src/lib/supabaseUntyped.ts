import { supabase } from "@/integrations/supabase/client";

type QueryError = { message: string };
type QueryResult = { data: unknown; error: QueryError | null };

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  update: (values: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  upsert: (values: unknown, options?: { onConflict?: string }) => QueryBuilder;
  single: () => PromiseLike<QueryResult>;
};

type UntypedSupabase = {
  from: (table: string) => QueryBuilder;
};

export const untypedSupabase = supabase as unknown as UntypedSupabase;

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};

