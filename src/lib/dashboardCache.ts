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
