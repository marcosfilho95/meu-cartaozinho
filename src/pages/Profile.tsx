import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_OPTIONS, DEFAULT_AVATAR_ID } from "@/data/avatars";
import { UserAvatar } from "@/components/UserAvatar";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { Check } from "lucide-react";
import { toast } from "sonner";

const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const isMissingAvatarColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id");
};

const USERNAME_REGEX = /^[a-z0-9._-]{3,20}$/;

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id || null;
      setUserId(id);
      if (!id) return;
      const cachedProfile = getStoredProfile(id);
      if (cachedProfile) {
        setName(cachedProfile.name || "");
        setAvatarId(cachedProfile.avatar_id || "");
      }
      const localAvatar = getStoredAvatarId(id);
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("name, avatar_id, username")
        .eq("user_id", id)
        .maybeSingle();
      if (error) {
        if (isMissingAvatarColumnError(error)) {
          localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
          const fallback = await supabase.from("profiles").select("name").eq("user_id", id).maybeSingle();
          setName(fallback.data?.name || "");
          setAvatarId(localAvatar || DEFAULT_AVATAR_ID);
          return;
        }
      }
      setName(profile?.name || "");
      setUsername((profile as any)?.username || "");
      const resolvedAvatar = profile?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;
      setAvatarId(resolvedAvatar);
      setStoredAvatarId(id, resolvedAvatar);
      setStoredProfile(id, { name: profile?.name || "", avatar_id: resolvedAvatar });
    });
  }, []);

  const usernameError = username.trim() && !USERNAME_REGEX.test(username.trim().toLowerCase())
    ? "Use 3-20 caracteres: letras minúsculas, números, ponto, underline ou hífen."
    : "";

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const payload: any = {
      user_id: userId,
      name: name.trim(),
      avatar_id: avatarId || DEFAULT_AVATAR_ID,
      updated_at: new Date().toISOString(),
    };
    if (username.trim() && !usernameError) {
      payload.username = username.trim().toLowerCase();
    }
    let { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      if (error.message?.toLowerCase().includes("username")) {
        toast.error("Esse nome de usuário já está em uso.");
        setSaving(false);
        return;
      }
      if (isMissingAvatarColumnError(error)) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        const { avatar_id, ...payloadWithoutAvatar } = payload;
        const fallback = await supabase.from("profiles").upsert(payloadWithoutAvatar, { onConflict: "user_id" });
        error = fallback.error;
        if (!error) {
          setStoredAvatarId(userId, avatarId || DEFAULT_AVATAR_ID);
          setStoredProfile(userId, { name: name.trim(), avatar_id: avatarId || DEFAULT_AVATAR_ID });
          toast.success("Perfil atualizado.");
          setSaving(false);
          return;
        }
      }
      if (error) {
        toast.error("Erro ao salvar perfil: " + error.message);
        setSaving(false);
        return;
      }
    }
    const resolvedAvatar = avatarId || DEFAULT_AVATAR_ID;
    setStoredAvatarId(userId, resolvedAvatar);
    setStoredProfile(userId, { name: name.trim(), avatar_id: resolvedAvatar });
    toast.success("Perfil atualizado");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        title="Perfil"
        subtitle="Personalize sua conta"
        avatarId={avatarId}
        showBack
        backTo="/"
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <div className="mx-auto max-w-lg w-full px-4 -mt-4 flex-1 space-y-4 pb-4 animate-fade-in">
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <div className="mb-4 flex items-center gap-3">
            <UserAvatar avatarId={avatarId} name={name} size={84} />
            <div>
              <p className="text-sm text-muted-foreground">Preview</p>
              <p className="font-heading text-lg font-bold text-foreground">{name || "Seu nome"}</p>
              {username && (
                <p className="text-xs text-muted-foreground">@{username.toLowerCase()}</p>
              )}
            </div>
          </div>

          <label className="mb-2 block text-sm font-semibold text-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={100} className="mb-4" />

          <label className="mb-2 block text-sm font-semibold text-foreground">Nome de usuário</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="ex: marcosfilho"
            maxLength={20}
          />
          {usernameError && <p className="text-xs text-destructive mt-1">{usernameError}</p>}
          <p className="text-[10px] text-muted-foreground mt-1">
            Cadastre um nome de usuário para fazer login sem precisar do e-mail.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <h2 className="font-heading text-lg font-bold text-foreground mb-3">Escolha seu avatar</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {AVATAR_OPTIONS.map((avatar) => {
              const selected = avatar.id === avatarId;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setAvatarId(avatar.id)}
                  className={`relative rounded-xl border p-2 transition-all ${
                    selected ? "border-primary shadow-card" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="rounded-lg bg-muted/40 p-2">
                    <img src={avatar.src} alt={avatar.label} className="h-36 w-full rounded-lg object-contain sm:h-40" />
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <Button className="w-full gradient-primary text-primary-foreground animate-fade-in" onClick={saveProfile} disabled={saving || !!usernameError}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default Profile;
