import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_AVATAR_ID } from "@/data/avatars";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";

const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

const getFirstName = (name: string) => {
  const firstName = name.trim().split(/\s+/)[0];
  return firstName || "Usuario";
};

type HeaderProfile = {
  name: string;
  firstName: string;
  greeting: string;
  avatarId: string;
};

export const useUserHeaderProfile = (userId: string | null | undefined): HeaderProfile => {
  const [name, setName] = useState("");
  const [avatarId, setAvatarIdState] = useState<string>(DEFAULT_AVATAR_ID);

  useEffect(() => {
    if (!userId) return;

    const cached = getStoredProfile(userId);
    const localAvatar = getStoredAvatarId(userId);

    if (cached?.name) {
      setName(cached.name);
    }
    if (cached?.avatar_id || localAvatar) {
      setAvatarIdState(cached?.avatar_id || localAvatar || DEFAULT_AVATAR_ID);
    }

    let mounted = true;
    const loadProfile = async () => {
      const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
      const select = skipAvatarColumn ? "name" : "name, avatar_id";
      const { data, error } = await supabase.from("profiles").select(select).eq("user_id", userId).maybeSingle();
      if (!mounted) return;

      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
      }

      const resolvedName = (data as { name?: string } | null)?.name || "";
      const resolvedAvatar =
        (data as { avatar_id?: string } | null)?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;

      setName(resolvedName);
      setAvatarIdState(resolvedAvatar);
      setStoredAvatarId(userId, resolvedAvatar);
      setStoredProfile(userId, { name: resolvedName, avatar_id: resolvedAvatar });
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
    }),
    [avatarId, name],
  );
};

