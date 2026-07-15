// Login flow that resolves username→email server-side, so the raw email is
// never returned to the browser. Only a valid session (or a generic error)
// leaves this function.
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
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!identifier || !password) return json({ error: "Credenciais inválidas." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Servidor indisponível." }, 500);

    let email = "";
    if (identifier.includes("@")) {
      if (!EMAIL_REGEX.test(identifier)) return json({ error: "Credenciais inválidas." }, 400);
      email = identifier;
    } else {
      if (!USERNAME_REGEX.test(identifier)) return json({ error: "Credenciais inválidas." }, 400);
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from("profiles")
        .select("email")
        .ilike("username", identifier)
        .maybeSingle();
      // Generic error to avoid disclosing whether the username exists.
      if (error || !data?.email) return json({ error: "Credenciais inválidas." }, 401);
      email = data.email as string;
    }

    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.session) return json({ error: "Credenciais inválidas." }, 401);

    return json({
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    });
  } catch {
    return json({ error: "Erro inesperado." }, 500);
  }
});