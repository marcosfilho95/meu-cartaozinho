// Password reset flow — resolves username→email server-side and triggers
// Supabase's reset email. Always returns a generic success so an outside
// caller can't tell whether a given username/email is registered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERNAME_REGEX = /^[a-z0-9._-]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: true });

  try {
    const body = await req.json().catch(() => null);
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
    const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : undefined;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !identifier) return json({ ok: true });

    let email = "";
    if (identifier.includes("@")) {
      if (EMAIL_REGEX.test(identifier)) email = identifier;
    } else if (USERNAME_REGEX.test(identifier)) {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data } = await admin
        .from("profiles")
        .select("email")
        .ilike("username", identifier)
        .maybeSingle();
      if (data?.email) email = data.email as string;
    }

    if (email) {
      const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
      await anon.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    }

    // Always generic — do not disclose account existence.
    return json({ ok: true });
  } catch {
    return json({ ok: true });
  }
});