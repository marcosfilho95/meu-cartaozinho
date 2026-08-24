/**
 * Cache de views financeiras em sessionStorage.
 * Objetivo: ao navegar entre páginas, mostrar imediatamente o último estado
 * conhecido e atualizar em segundo plano, sem tela de carregamento.
 */

const TTL_MS = 1000 * 60 * 30; // 30 minutos

type Envelope<T> = { at: number; value: T };

const memory = new Map<string, Envelope<unknown>>();

const storageKey = (key: string) => `finance:view:${key}`;

export const getFinanceViewCache = <T,>(key: string): T | null => {
  const cached = memory.get(storageKey(key)) as Envelope<T> | undefined;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    memory.set(storageKey(key), parsed);
    return parsed.value;
  } catch {
    return null;
  }
};

export const setFinanceViewCache = <T,>(key: string, value: T) => {
  const envelope: Envelope<T> = { at: Date.now(), value };
  memory.set(storageKey(key), envelope);
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch {
    // sessionStorage cheio/indisponível — o cache em memória continua válido
  }
};

export const clearFinanceViewCache = () => {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("finance:view:")) sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
};
