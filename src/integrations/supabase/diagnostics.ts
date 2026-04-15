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
      message: "Configuração de Supabase ausente ou inválida no .env.",
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
      return { ok: true, message: "Conexão com Supabase OK.", status: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        message: "Chave de API inválida para o projeto informado.",
      };
    }

    return {
      ok: false,
      status: response.status,
      message: "Supabase respondeu com erro. Verifique URL, status do projeto e chaves.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido de rede.";
    return {
      ok: false,
      message: `Falha de conexão com Supabase: ${message}`,
    };
  }
};
