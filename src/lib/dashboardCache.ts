interface CardCache {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

interface TotalsCacheValue {
  total: number;
  count: number;
  active: number;
}

export interface DashboardCache {
  cards: CardCache[];
  totals: Record<string, TotalsCacheValue>;
  monthPaymentStatus?: "paid" | "open" | "empty";
  overdueOpenCount?: number;
}

const CACHE_PREFIX = "dashboard-cache:v2:";
const cacheKey = (userId: string, month: string) => `${CACHE_PREFIX}${userId}:${month}`;

export const getDashboardCache = (userId: string, month: string): DashboardCache | null => {
  try {
    const raw = localStorage.getItem(cacheKey(userId, month));
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch {
    return null;
  }
};

export const setDashboardCache = (userId: string, month: string, data: DashboardCache) => {
  try {
    localStorage.setItem(cacheKey(userId, month), JSON.stringify(data));
  } catch {
    // ignore localStorage failures
  }
};

export const clearDashboardCache = (userId: string) => {
  try {
    const prefix = `${CACHE_PREFIX}${userId}:`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore localStorage failures
  }
};
