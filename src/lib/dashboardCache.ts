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

const cacheKey = (userId: string, month: string) => `dashboard-cache:${userId}:${month}`;

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
    const prefix = `dashboard-cache:${userId}:`;
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
