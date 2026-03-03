import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_OPTIONS, DEFAULT_AVATAR_ID } from "@/data/avatars";
import { UserAvatar } from "@/components/UserAvatar";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredAvatarId, setStoredAvatarId } from "@/lib/profileAvatar";
import { getStoredProfile, setStoredProfile } from "@/lib/profileCache";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

const PROFILE_AVATAR_COLUMN_MISSING_KEY = "profiles:avatar_id_missing";
const isMissingAvatarColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = String(error.message || "");
  return error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id");
};

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [saving, setSaving] = useState(false);

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
      const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
      const profileQuery = skipAvatarColumn
        ? supabase.from("profiles").select("name").eq("user_id", id).maybeSingle()
        : supabase.from("profiles").select("name, avatar_id").eq("user_id", id).maybeSingle();
      const { data: profile, error } = await profileQuery;
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
      const resolvedAvatar = profile?.avatar_id || localAvatar || DEFAULT_AVATAR_ID;
      setAvatarId(resolvedAvatar);
      setStoredAvatarId(id, resolvedAvatar);
      setStoredProfile(id, { name: profile?.name || "", avatar_id: resolvedAvatar });
    });
  }, []);

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const skipAvatarColumn = localStorage.getItem(PROFILE_AVATAR_COLUMN_MISSING_KEY) === "1";
    const payloadWithAvatar = {
      user_id: userId,
      name: name.trim(),
      avatar_id: avatarId || DEFAULT_AVATAR_ID,
      updated_at: new Date().toISOString(),
    };
    const payloadWithoutAvatar = {
      user_id: userId,
      name: name.trim(),
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase
      .from("profiles")
      .upsert(skipAvatarColumn ? payloadWithoutAvatar : payloadWithAvatar, { onConflict: "user_id" });
    if (error) {
      if (isMissingAvatarColumnError(error)) {
        localStorage.setItem(PROFILE_AVATAR_COLUMN_MISSING_KEY, "1");
        const fallback = await supabase.from("profiles").upsert(payloadWithoutAvatar, { onConflict: "user_id" });
        error = fallback.error;
        if (!error) {
          const resolvedAvatar = avatarId || DEFAULT_AVATAR_ID;
          setStoredAvatarId(userId, resolvedAvatar);
          setStoredProfile(userId, { name: name.trim(), avatar_id: resolvedAvatar });
          toast.success("Perfil atualizado. Avatar salvo localmente neste navegador.");
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
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="-ml-2 mb-3 gap-1 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold text-primary-foreground">Perfil</h1>
          </div>
          <p className="text-sm text-primary-foreground/80">Escolha seu avatar e personalize sua conta</p>
        </div>
      </header>

      <div className="container -mt-4 flex-1 space-y-4 pb-4 animate-fade-in">
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <div className="mb-4 flex items-center gap-3">
            <UserAvatar avatarId={avatarId} name={name} size={84} />
            <div>
              <p className="text-sm text-muted-foreground">Preview</p>
              <p className="font-heading text-lg font-bold text-foreground">{name || "Seu nome"}</p>
            </div>
          </div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={100} />
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card animate-fade-in">
          <h2 className="font-heading text-lg font-bold text-foreground">Escolha seu avatar</h2>
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

        <Button className="w-full gradient-primary text-primary-foreground animate-fade-in" onClick={saveProfile} disabled={saving}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default Profile;
