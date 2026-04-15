import { SUPABASE_ENV } from "./env";

type SupabaseConnectionCheck = {
  ok: boolean;
  message: string;
  status?: number;
};

export const checkSupabaseConnection = async (): Promise<SupabaseConnectionCheck> => {
  if (!SUPABASE_ENV.isConfigured || !SUPABASE_ENV.url || !SUPABASE_ENV.key) {
    return {
      ok: false,
      message: "Supabase config missing or invalid in .env.",
    };
  }

  try {
    const response = await fetch(`${SUPABASE_ENV.url}/auth/v1/settings`, {
      method: "GET",
      cache: "no-store",
      headers: {
        apikey: SUPABASE_ENV.key,
        Authorization: `Bearer ${SUPABASE_ENV.key}`,
      },
    });

    if (response.ok) {
      return { ok: true, message: "Supabase connection OK.", status: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      const source = SUPABASE_ENV.keyName ? ` (source: ${SUPABASE_ENV.keyName})` : "";
      return {
        ok: false,
        status: response.status,
        message: `Invalid API key for the configured project${source}.`,
      };
    }

    return {
      ok: false,
      status: response.status,
      message: "Supabase returned an error. Check URL, project status and keys.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error.";
    return {
      ok: false,
      message: `Supabase connection failed: ${message}`,
    };
  }
};