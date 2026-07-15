import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uris?: string[] };
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

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
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Faça login para continuar</h1>
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
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold">Não foi possível carregar a autorização</h1>
          <p className="mt-2 text-sm text-muted-foreground break-words">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "outro aplicativo";
  const scopeList =
    details.scopes ?? (details.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Conectar {clientName} à sua conta</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {clientName} poderá usar as ferramentas deste app em seu nome enquanto você estiver conectado.
        </p>
        {scopeList.length > 0 && (
          <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
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
    </main>
  );
}
