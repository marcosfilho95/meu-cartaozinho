const keyFor = (kind: string, userId: string) => `finance:${kind}:${userId}`;

const read = <T,>(kind: string, userId: string): T | null => {
  try {
    const raw = sessionStorage.getItem(keyFor(kind, userId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const write = <T,>(kind: string, userId: string, value: T) => {
  try {
    sessionStorage.setItem(keyFor(kind, userId), JSON.stringify(value));
  } catch {
    // ignore cache write failures
  }
};

export const getFinanceAccountsCache = <T,>(userId: string) => read<T>("accounts", userId);
export const setFinanceAccountsCache = <T,>(userId: string, value: T) => write("accounts", userId, value);

export const getFinanceCategoriesCache = <T,>(userId: string) => read<T>("categories", userId);
export const setFinanceCategoriesCache = <T,>(userId: string, value: T) => write("categories", userId, value);

export const getFinanceTransactionsCache = <T,>(userId: string) => read<T>("transactions", userId);
export const setFinanceTransactionsCache = <T,>(userId: string, value: T) => write("transactions", userId, value);

export const clearFinancePageCaches = (userId: string) => {
  try {
    ["accounts", "categories", "transactions"].forEach((kind) => {
      sessionStorage.removeItem(keyFor(kind, userId));
    });
  } catch {
    // ignore cache clear failures
  }
};
