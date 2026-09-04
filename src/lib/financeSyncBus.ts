/**
 * Barramento único de sincronização financeira.
 * - Limpa os caches de view afetados
 * - Notifica a aba atual (CustomEvent) e as demais abas (BroadcastChannel)
 */
import { clearFinanceViewCache } from "@/lib/financeViewCache";
import { clearFinancePageCaches } from "@/lib/financePageCache";

export const FINANCE_SYNC_EVENT = "finance-sync-updated";
const CHANNEL_NAME = "finance-sync";

export type FinanceSyncDetail = {
  userId?: string;
  months?: string[];
  source?: string;
  /** Marca eventos vindos de outra aba, para evitar eco. */
  remote?: boolean;
};

let channel: BroadcastChannel | null = null;

const getChannel = () => {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
};

const invalidateCaches = (detail: FinanceSyncDetail) => {
  clearFinanceViewCache();
  if (detail.userId) clearFinancePageCaches(detail.userId);
};

/** Dispara sincronização após criar/editar/pagar/excluir/importar algo. */
export const emitFinanceSync = (detail: FinanceSyncDetail = {}) => {
  if (typeof window === "undefined") return;
  invalidateCaches(detail);
  window.dispatchEvent(new CustomEvent(FINANCE_SYNC_EVENT, { detail }));
  try {
    getChannel()?.postMessage({ ...detail, remote: true });
  } catch {
    // canal indisponível — a aba atual já foi atualizada
  }
};

/** Escuta atualizações locais e de outras abas. Retorna a função de limpeza. */
export const subscribeFinanceSync = (handler: (detail: FinanceSyncDetail) => void) => {
  if (typeof window === "undefined") return () => {};

  const onLocal = (event: Event) => {
    handler(((event as CustomEvent).detail || {}) as FinanceSyncDetail);
  };
  const onRemote = (event: MessageEvent) => {
    const detail = (event.data || {}) as FinanceSyncDetail;
    invalidateCaches(detail);
    handler(detail);
  };

  window.addEventListener(FINANCE_SYNC_EVENT, onLocal as EventListener);
  const bc = getChannel();
  bc?.addEventListener("message", onRemote as EventListener);

  return () => {
    window.removeEventListener(FINANCE_SYNC_EVENT, onLocal as EventListener);
    bc?.removeEventListener("message", onRemote as EventListener);
  };
};
