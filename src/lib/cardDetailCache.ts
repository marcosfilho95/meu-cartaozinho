interface CachedCard {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

interface CachedProfile {
  name: string;
  avatar_id: string | null;
}

export interface CardDetailCache {
  card: CachedCard | null;
  allCards: CachedCard[];
  installments: any[];
  profile: CachedProfile | null;
}

const keyFor = (userId: string, cardId: string, month: string) => `card-detail-cache:${userId}:${cardId}:${month}`;

export const getCardDetailCache = (userId: string, cardId: string, month: string): CardDetailCache | null => {
  try {
    const raw = localStorage.getItem(keyFor(userId, cardId, month));
    if (!raw) return null;
    return JSON.parse(raw) as CardDetailCache;
  } catch {
    return null;
  }
};

export const setCardDetailCache = (userId: string, cardId: string, month: string, data: CardDetailCache) => {
  try {
    localStorage.setItem(keyFor(userId, cardId, month), JSON.stringify(data));
  } catch {
    // ignore localStorage failures
  }
};
