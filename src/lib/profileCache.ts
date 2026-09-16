export interface CachedProfile {
  name: string | null;
  avatar_id: string | null;
  /** Foto do usuário: guardada para evitar o avatar padrão piscando na abertura. */
  avatar_url?: string | null;
}

const keyFor = (userId: string) => `profile-cache:${userId}`;

export const getStoredProfile = (userId: string): CachedProfile | null => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      avatar_id: typeof parsed.avatar_id === "string" ? parsed.avatar_id : null,
      avatar_url: typeof parsed.avatar_url === "string" ? parsed.avatar_url : null,
    };
  } catch {
    return null;
  }
};

export const setStoredProfile = (userId: string, profile: CachedProfile) => {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(profile));
  } catch {
    // ignore localStorage failures
  }
};
