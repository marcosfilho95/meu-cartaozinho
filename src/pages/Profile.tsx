import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_AVATAR_ID } from "@/data/avatars";
import { UserAvatar } from "@/components/UserAvatar";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { writeCachedAvatarUrl } from "@/hooks/use-user-header-profile";
import { Camera, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const PROFILE_AVATAR_URL_MISSING_KEY = "profiles:avatar_url_missing";
const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

const isMissingAvatarColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id");
};
const isMissingAvatarUrlColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return (error.code === "42703" || error.code === "PGRST204") && message.includes("avatar_url");
};
const isMissingUsernameRpc = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const text = String(error.message || "");
  return error.code === "PGRST202" || text.includes("get_login_email_by_username");
};

const extractStoragePath = (avatarUrl: string): string | null => {
  if (!avatarUrl) return null;
  const match = avatarUrl.match(/\/object\/(?:sign|public)\/avatars\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (error && isMissingAvatarColumnError(error)) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        const fallback = await supabase.from("profiles").select("name").eq("user_id", id).maybeSingle();
        setName(fallback.data?.name || "");
        setAvatarId(localAvatar || DEFAULT_AVATAR_ID);
        setInitialUsername("");
      } else {
        setName(profile?.name || "");
        const loadedUsername = ((profile as any)?.username || "").toLowerCase();
        setUsername(loadedUsername);
        setInitialUsername(loadedUsername);
        const resolvedAvatar = profile?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;
        setAvatarId(resolvedAvatar);
        setStoredAvatarId(id, resolvedAvatar);
        setStoredProfile(id, { name: profile?.name || "", avatar_id: resolvedAvatar });
      }

      const { data: urlRow, error: urlErr } = await supabase
        .from("profiles" as any)
        .select("avatar_url")
        .eq("user_id", id)
        .maybeSingle();
      if (!urlErr) {
        const loadedUrl = (urlRow as any)?.avatar_url || "";
        setAvatarUrl(loadedUrl);
        writeCachedAvatarUrl(id, loadedUrl);
      } else if (isMissingAvatarUrlColumnError(urlErr as any)) {
        localStorage.setItem(PROFILE_AVATAR_URL_MISSING_KEY, "1");
      }
    });
  }, []);

  const usernameError = username.trim() && !USERNAME_REGEX.test(username.trim().toLowerCase())
    ? "Use 3-20 caracteres: letras minúsculas, números, ponto, underline ou hífen."
    : "";
  const usernameLocked = !!initialUsername;

  const handleAvatarFile = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5 MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const ext = rawExt || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const previousPath = extractStoragePath(avatarUrl);
      if (previousPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      }

      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (signErr || !signed?.signedUrl) throw signErr || new Error("Falha ao gerar URL da imagem");

      const newUrl = signed.signedUrl;
      const { error: updateErr } = await supabase
        .from("profiles" as any)
        .update({ avatar_url: newUrl, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (updateErr) {
        if (isMissingAvatarUrlColumnError(updateErr as any)) {
          localStorage.setItem(PROFILE_AVATAR_URL_MISSING_KEY, "1");
        } else {
          throw updateErr;
        }
      }

      setAvatarUrl(newUrl);
      writeCachedAvatarUrl(userId, newUrl);
      toast.success("Foto de perfil atualizada.");
    } catch (e: any) {
      console.error("Avatar upload failed", e);
      toast.error("Não foi possível enviar a foto: " + (e?.message || "erro desconhecido"));
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    if (!userId || !avatarUrl) return;
    setUploadingAvatar(true);
    try {
      const previousPath = extractStoragePath(avatarUrl);
      if (previousPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      }
      const { error } = await supabase
        .from("profiles" as any)
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error && !isMissingAvatarUrlColumnError(error as any)) throw error;
      setAvatarUrl("");
      writeCachedAvatarUrl(userId, "");
      toast.success("Foto removida.");
    } catch (e: any) {
      toast.error("Não foi possível remover: " + (e?.message || "erro"));
    } finally {
      setUploadingAvatar(false);
    }
  };

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
      const { data: available, error: usernameLookupError } = await supabase.rpc("is_username_available", {
        p_username: normalizedUsername,
      });
      if (usernameLookupError && !isMissingUsernameRpc(usernameLookupError as any)) {
        toast.error("Erro ao validar nome de usuário.");
        setSaving(false);
        return;
      }
      // available === false means it's taken by someone else — reject unless
      // it's already the current user's username (unchanged).
      if (available === false && normalizedUsername !== (username || "").trim().toLowerCase()) {
        toast.error("Esse nome de usuário já está em uso.");
        setSaving(false);
        return;
      }
      payload.username = normalizedUsername;
    }
    let { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
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
        avatarUrl={avatarUrl}
        showBack
        preferHistoryBack
        backTo="/"
      />

      <div className="mx-auto max-w-lg w-full px-4 -mt-4 flex-1 space-y-4 pb-4 animate-fade-in">
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <div className="mb-5 flex items-center gap-4">
            <div className="relative">
              <UserAvatar avatarId={avatarId} avatarUrl={avatarUrl} name={name} size={88} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Alterar foto"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card transition-transform hover:scale-105 disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Foto de perfil</p>
              <p className="truncate font-heading text-lg font-bold text-foreground">{name || "Seu nome"}</p>
              {username && (
                <p className="text-xs text-muted-foreground">@{username.toLowerCase()}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {uploadingAvatar ? "Enviando..." : avatarUrl ? "Trocar foto" : "Enviar foto"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={removeAvatar}
                    disabled={uploadingAvatar}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remover
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarFile(file);
                }}
              />
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

        <Button className="w-full gradient-primary text-primary-foreground animate-fade-in" onClick={saveProfile} disabled={saving || !!usernameError}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default Profile;
