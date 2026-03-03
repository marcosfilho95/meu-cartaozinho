const avatarStorageKey = (userId: string) => `profile-avatar:${userId}`;

export const getStoredAvatarId = (userId: string): string | null => {
  try {
    return localStorage.getItem(avatarStorageKey(userId));
  } catch {
    return null;
  }
};

export const setStoredAvatarId = (userId: string, avatarId: string) => {
  try {
    localStorage.setItem(avatarStorageKey(userId), avatarId);
  } catch {
    // ignore localStorage failures
  }
};
