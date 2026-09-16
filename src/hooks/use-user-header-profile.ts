import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_AVATAR_ID } from "@/data/avatars";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";

const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const PROFILE_AVATAR_URL_MISSING_KEY = "profiles:avatar_url_missing";
const PROFILE_AVATAR_URL_CACHE_KEY = "profiles:avatar_url_cache";

const readCachedAvatarUrl = (userId: string): string => {
  try {
    const raw = localStorage.getItem(`${PROFILE_AVATAR_URL_CACHE_KEY}:${userId}`);
    if (raw) return raw;
    return getStoredProfile(userId)?.avatar_url || "";
  } catch {
    return "";
  }
};

const writeCachedAvatarUrl = (userId: string, url: string) => {
  try {
    if (url) localStorage.setItem(`${PROFILE_AVATAR_URL_CACHE_KEY}:${userId}`, url);
    else localStorage.removeItem(`${PROFILE_AVATAR_URL_CACHE_KEY}:${userId}`);
    const cached = getStoredProfile(userId);
    setStoredProfile(userId, {
      name: cached?.name ?? null,
      avatar_id: cached?.avatar_id ?? null,
      avatar_url: url || null,
    });
  } catch {
    /* ignore */
  }
};

export { readCachedAvatarUrl, writeCachedAvatarUrl };

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

const getFirstName = (name: string) => {
  const firstName = name.trim().split(/\s+/)[0];
  return firstName || "Usuário";
};

type HeaderProfile = {
  name: string;
  firstName: string;
  greeting: string;
  avatarId: string;
  avatarUrl: string;
  /** false enquanto ainda não sabemos se o usuário tem foto (evita piscar o avatar padrão). */
  resolved: boolean;
};

export const useUserHeaderProfile = (userId: string | null | undefined): HeaderProfile => {
  const [name, setName] = useState("");
  const [avatarId, setAvatarIdState] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const cached = getStoredProfile(userId);
    const localAvatar = getStoredAvatarId(userId);
    const cachedUrl = readCachedAvatarUrl(userId);

    if (cached?.name) setName(cached.name);
    if (cached?.avatar_id || localAvatar) setAvatarIdState(cached?.avatar_id || localAvatar || "");
    if (cachedUrl) setAvatarUrl(cachedUrl);
    // Com cache válido já mostramos a foto certa de imediato.
    if (cachedUrl || cached?.avatar_id || localAvatar) setResolved(true);

    let mounted = true;
    const loadProfile = async () => {
      const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
      const skipAvatarUrl = localStorage.getItem(PROFILE_AVATAR_URL_MISSING_KEY) === "1";
      const columns = ["name"];
      if (!skipAvatarColumn) columns.push("avatar_id");
      if (!skipAvatarUrl) columns.push("avatar_url");
      const select = columns.join(", ");
      const { data, error } = await supabase.from("profiles").select(select).eq("user_id", userId).maybeSingle();
      if (!mounted) return;

      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        const msg = String(error.message || "");
        if (msg.includes("avatar_url")) {
          localStorage.setItem(PROFILE_AVATAR_URL_MISSING_KEY, "1");
        } else {
          localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        }
      }

      const resolvedName = (data as { name?: string } | null)?.name || "";
      const resolvedAvatar =
        (data as { avatar_id?: string } | null)?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;
      const resolvedUrl = (data as { avatar_url?: string } | null)?.avatar_url || "";

      setName(resolvedName);
      setAvatarIdState(resolvedAvatar);
      setAvatarUrl(resolvedUrl);
      setResolved(true);
      writeCachedAvatarUrl(userId, resolvedUrl);
      setStoredAvatarId(userId, resolvedAvatar);
      setStoredProfile(userId, { name: resolvedName, avatar_id: resolvedAvatar, avatar_url: resolvedUrl || null });
    };

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [userId]);

  return useMemo(
    () => ({
      name,
      firstName: getFirstName(name),
      greeting: getGreeting(),
      avatarId,
      avatarUrl,
      resolved,
    }),
    [avatarId, avatarUrl, name, resolved],
  );
};
