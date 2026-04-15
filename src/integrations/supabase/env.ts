type SupabaseEnvResult = {
  url: string | null;
  key: string | null;
  keyName: "VITE_SUPABASE_ANON_KEY" | "VITE_SUPABASE_PUBLISHABLE_KEY" | null;
  issues: string[];
  isConfigured: boolean;
};

const readEnv = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, "");
};

const isPlaceholder = (value: string) =>
  /^(your-|<.*>|sb_publishable_your-|sb_anon_your-)/i.test(value);

const buildProjectUrl = (projectId: string) => `https://${projectId}.supabase.co`;

const isValidProjectId = (projectId: string) => /^[a-z0-9]{20}$/.test(projectId);

const getSupabaseUrl = () => {
  const envUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
  const projectId = readEnv(import.meta.env.VITE_SUPABASE_PROJECT_ID);

  if (envUrl) {
    return envUrl;
  }

  if (projectId && isValidProjectId(projectId)) {
    return buildProjectUrl(projectId);
  }

  return "";
};

export const getSupabaseEnv = (): SupabaseEnvResult => {
  const url = getSupabaseUrl();
  const anonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const publishableKey = readEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  const key = anonKey || publishableKey;
  const keyName = anonKey
    ? "VITE_SUPABASE_ANON_KEY"
    : publishableKey
      ? "VITE_SUPABASE_PUBLISHABLE_KEY"
      : null;

  const issues: string[] = [];

  if (!url) {
    issues.push("Variável ausente: VITE_SUPABASE_URL (ou VITE_SUPABASE_PROJECT_ID válido).");
  } else {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        issues.push("VITE_SUPABASE_URL precisa iniciar com http:// ou https://.");
      }
    } catch {
      issues.push("VITE_SUPABASE_URL não é uma URL válida.");
    }
  }

  if (!key) {
    issues.push("Defina VITE_SUPABASE_ANON_KEY ou VITE_SUPABASE_PUBLISHABLE_KEY.");
  } else if (isPlaceholder(key)) {
    issues.push("A chave do Supabase parece placeholder. Cole a chave publishable/anon completa.");
  }

  return {
    url: url || null,
    key: key || null,
    keyName,
    issues,
    isConfigured: issues.length === 0,
  };
};

export const SUPABASE_ENV = getSupabaseEnv();
