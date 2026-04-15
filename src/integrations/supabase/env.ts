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

const isPlaceholder = (value: string) => /^(your-|<.*>|sb_publishable_your-|sb_anon_your-)/i.test(value);

const buildProjectUrl = (projectId: string) => `https://${projectId}.supabase.co`;

const isValidProjectId = (projectId: string) => /^[a-z0-9]{20}$/.test(projectId);

const parseProjectIdFromUrl = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
};

const parseJwtPayload = (token: string) => {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const raw = atob(padded);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const parseProjectRefFromKey = (key: string) => {
  const payload = parseJwtPayload(key);
  const ref = payload?.ref;
  return typeof ref === "string" ? ref : "";
};

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
  const projectIdFromUrl = url ? parseProjectIdFromUrl(url) : "";

  const candidateKeys: Array<{ name: "VITE_SUPABASE_PUBLISHABLE_KEY" | "VITE_SUPABASE_ANON_KEY"; value: string }> = [];
  if (publishableKey) candidateKeys.push({ name: "VITE_SUPABASE_PUBLISHABLE_KEY", value: publishableKey });
  if (anonKey) candidateKeys.push({ name: "VITE_SUPABASE_ANON_KEY", value: anonKey });

  let selected = candidateKeys[0] ?? null;
  if (projectIdFromUrl && candidateKeys.length > 1) {
    const matchedByRef = candidateKeys.find((item) => parseProjectRefFromKey(item.value) === projectIdFromUrl);
    if (matchedByRef) selected = matchedByRef;
  }

  const key = selected?.value ?? "";
  const keyName = selected?.name ?? null;

  const issues: string[] = [];

  if (!url) {
    issues.push("Missing variable: VITE_SUPABASE_URL (or a valid VITE_SUPABASE_PROJECT_ID).");
  } else {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        issues.push("VITE_SUPABASE_URL must start with http:// or https://.");
      }
    } catch {
      issues.push("VITE_SUPABASE_URL is not a valid URL.");
    }
  }

  if (!key) {
    issues.push("Set VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.");
  } else if (isPlaceholder(key)) {
    issues.push("Supabase key looks like placeholder. Paste the full publishable/anon key.");
  } else if (projectIdFromUrl) {
    const keyProjectRef = parseProjectRefFromKey(key);
    if (keyProjectRef && keyProjectRef !== projectIdFromUrl) {
      issues.push("Supabase key does not belong to the project in VITE_SUPABASE_URL.");
    }
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