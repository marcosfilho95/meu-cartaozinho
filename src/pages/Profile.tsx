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
const isMissingUsernameRpc = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const text = String(error.message || "");
  return error.code === "PGRST202" || text.includes("get_login_email_by_username");
};

const USERNAME_REGEX = /^[a-z0-9._-]{3,20}$/;

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [accountCreatedAt, setAccountCreatedAt] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user || null;
      const id = sessionUser?.id || null;
      setUserId(id);
      setUserEmail(sessionUser?.email || "");
      setAccountCreatedAt(sessionUser?.created_at || "");
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
          setInitialUsername("");
          return;
        }
      }
      setName(profile?.name || "");
      const loadedUsername = ((profile as any)?.username || "").toLowerCase();
      setUsername(loadedUsername);
      setInitialUsername(loadedUsername);
      const resolvedAvatar = profile?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;
      setAvatarId(resolvedAvatar);
      setStoredAvatarId(id, resolvedAvatar);
      setStoredProfile(id, { name: profile?.name || "", avatar_id: resolvedAvatar });
    });
  }, []);

  const usernameError = username.trim() && !USERNAME_REGEX.test(username.trim().toLowerCase())
    ? "Use 3-20 caracteres: letras minúsculas, números, ponto, underline ou hífen."
    : "";
  const usernameLocked = !!initialUsername;

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const payload: any = {
      user_id: userId,
      name: name.trim(),
      avatar_id: avatarId || DEFAULT_AVATAR_ID,
      updated_at: new Date().toISOString(),
    };
    const normalizedUsername = username.trim().toLowerCase();
    if (!usernameLocked && normalizedUsername && !usernameError) {
      const { data: existingEmail, error: usernameLookupError } = await supabase.rpc("get_login_email_by_username", {
        p_username: normalizedUsername,
      });
      if (usernameLookupError && !isMissingUsernameRpc(usernameLookupError as any)) {
        toast.error("Erro ao validar nome de usuário.");
        setSaving(false);
        return;
      }
      if (existingEmail && existingEmail !== userEmail) {
        toast.error("Esse nome de usuário já está em uso.");
        setSaving(false);
        return;
      }
      payload.username = normalizedUsername;
    }
    let { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      if (error.message?.toLowerCase().includes("cannot be changed")) {
        toast.error("O nome de usuário só pode ser definido uma única vez.");
        setSaving(false);
        return;
      }
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
    if (!usernameLocked && normalizedUsername) {
      setInitialUsername(normalizedUsername);
      setUsername(normalizedUsername);
    }
    toast.success("Perfil atualizado");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        title="Perfil"
        subtitle="Personalize sua conta"
        userName={name || "Usuário"}
        avatarId={avatarId}
        showBack
        preferHistoryBack
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
            disabled={usernameLocked}
          />
          {usernameError && <p className="text-xs text-destructive mt-1">{usernameError}</p>}
          <p className="text-[10px] text-muted-foreground mt-1">
            {usernameLocked
              ? "Nome de usuário já definido. Por segurança, não pode ser alterado."
              : "Defina uma única vez para fazer login sem precisar do e-mail."}
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <h2 className="font-heading text-base font-bold text-foreground mb-3">Dados da conta</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">E-mail</p>
              <p className="text-sm font-semibold text-foreground break-all">{userEmail || "—"}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Usuário</p>
              <p className="text-sm font-semibold text-foreground">{username ? `@${username}` : "Não definido"}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 sm:col-span-2">
              <p className="text-[11px] text-muted-foreground">Cadastro</p>
              <p className="text-sm font-semibold text-foreground">
                {accountCreatedAt
                  ? new Date(accountCreatedAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
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

