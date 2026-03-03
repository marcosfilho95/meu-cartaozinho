export interface PurchaseCacheItem {
  id: string;
  card_id: string;
  description: string;
  total_amount: number;
  installments_count: number;
  due_day: number;
  start_month: string;
  person: string | null;
  notes: string | null;
  created_at: string;
  cards: { name: string; brand: string | null } | null;
}

const keyFor = (userId: string) => `purchases-cache:${userId}`;

export const getPurchasesCache = (userId: string): PurchaseCacheItem[] | null => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    return JSON.parse(raw) as PurchaseCacheItem[];
  } catch {
    return null;
  }
};

export const setPurchasesCache = (userId: string, data: PurchaseCacheItem[]) => {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(data));
  } catch {
    // ignore localStorage failures
  }
};
