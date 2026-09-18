import { type ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uris?: string[] };
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

const ConsentShell = ({ children }: { children: ReactNode }) => (
  <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3eddd] p-3 sm:p-6">
    <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#d8bd70]/20 blur-3xl" />
    <section className="relative grid w-full max-w-[900px] overflow-hidden rounded-[2rem] border border-white/70 bg-card shadow-[0_30px_90px_-35px_rgba(12,54,40,0.38)] md:grid-cols-[0.72fr_1.28fr]">
      <aside className="relative overflow-hidden bg-[#0b3b2b] p-7 text-white sm:p-9 md:flex md:min-h-[560px] md:flex-col md:justify-between md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-[#d6b968]/25" />
        <div className="relative">
          <AppLogo size="lg" className="mb-6 h-16 w-16 rounded-2xl bg-[#f5efdf] ring-1 ring-white/20" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#dcc882]">Conexão segura</p>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-[-0.035em]">Meu Cartãozinho</h1>
        </div>
        <div className="relative mt-8 hidden items-center gap-3 border-t border-white/10 pt-6 text-sm text-white/65 md:flex">
          <ShieldCheck className="h-5 w-5 text-[#dcc882]" /> Você decide quem acessa seus dados.
        </div>
      </aside>
      <div className="flex min-h-[360px] items-center p-7 sm:p-10 md:p-12">
        <div className="w-full">{children}</div>
      </div>
    </section>
  </main>
);

// Minimal wrapper for the beta supabase.auth.oauth namespace.
function oauthApi() {
  const anyAuth = (supabase.auth as any).oauth;
  return anyAuth as {
    getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: any }>;
    approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: any }>;
    denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: any }>;
  };
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        try {
          sessionStorage.setItem("pendingConsentUrl", window.location.pathname + window.location.search);
        } catch {
          // Continue to login when sessionStorage is unavailable.
        }
        setNeedsLogin(true);
        return;
      }
      const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message ?? "Não foi possível carregar a solicitação.");
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Erro ao processar a decisão.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou um endereço de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  if (needsLogin) {
    return (
      <ConsentShell>
        <div className="text-center md:text-left">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-primary/60">Autorização</p>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-[-0.025em]">Faça login para continuar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você precisa entrar na sua conta para autorizar este aplicativo.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Ir para login
          </Button>
        </div>
      </ConsentShell>
    );
  }

  if (error) {
    return (
      <ConsentShell>
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-destructive/70">Algo não saiu como esperado</p>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-[-0.025em]">Não foi possível carregar a autorização</h1>
          <p className="mt-2 text-sm text-muted-foreground break-words">{error}</p>
        </div>
      </ConsentShell>
    );
  }

  if (!details) {
    return (
      <ConsentShell>
        <div className="flex flex-col items-center text-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Carregando autorização...</p></div>
      </ConsentShell>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "outro aplicativo";
  const scopeList =
    details.scopes ?? (details.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <ConsentShell>
      <div>
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-primary/60">Nova conexão</p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-[-0.025em]">Conectar {clientName} à sua conta</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {clientName} poderá usar as ferramentas deste app em seu nome enquanto você estiver conectado.
        </p>
        {scopeList.length > 0 && (
          <div className="mt-5 rounded-2xl border border-border/60 bg-secondary/35 p-4 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Permissões solicitadas</div>
            <ul className="list-disc pl-4">
              {scopeList.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Isso não desativa as permissões e políticas do app; apenas concede acesso às ferramentas expostas.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Recusar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Autorizar
          </Button>
        </div>
      </div>
    </ConsentShell>
  );
}
