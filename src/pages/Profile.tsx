import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_OPTIONS } from "@/data/avatars";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string>("cat-female");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id || null;
      setUserId(id);
      if (!id) return;
      const { data: profile, error } = await supabase.from("profiles").select("name, avatar_id").eq("user_id", id).maybeSingle();
      if (error) {
        const message = String(error.message || "");
        if (error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id")) {
          const fallback = await supabase.from("profiles").select("name").eq("user_id", id).maybeSingle();
          setName(fallback.data?.name || "");
          setAvatarId("cat-female");
          return;
        }
      }
      setName(profile?.name || "");
      setAvatarId(profile?.avatar_id || "cat-female");
    });
  }, []);

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const payloadWithAvatar = {
      user_id: userId,
      name: name.trim(),
      avatar_id: avatarId,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("profiles").upsert(payloadWithAvatar, { onConflict: "user_id" });
    if (error) {
      const message = String(error.message || "");
      if (error.code === "42703" || error.code === "PGRST204" || message.includes("avatar_id")) {
        const payloadWithoutAvatar = {
          user_id: userId,
          name: name.trim(),
          updated_at: new Date().toISOString(),
        };
        const fallback = await supabase.from("profiles").upsert(payloadWithoutAvatar, { onConflict: "user_id" });
        error = fallback.error;
      }
      if (error) {
        toast.error("Erro ao salvar perfil: " + error.message);
        setSaving(false);
        return;
      }
    }
    toast.success("Perfil atualizado");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
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
          <h1 className="font-heading text-2xl font-bold text-primary-foreground">Perfil</h1>
          <p className="text-sm text-primary-foreground/80">Escolha seu avatar e personalize sua conta</p>
        </div>
      </header>

      <div className="container -mt-4 space-y-4">
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-4 flex items-center gap-3">
            <UserAvatar avatarId={avatarId} name={name} size={60} />
            <div>
              <p className="text-sm text-muted-foreground">Preview</p>
              <p className="font-heading text-lg font-bold text-foreground">{name || "Seu nome"}</p>
            </div>
          </div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={100} />
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
          <h2 className="font-heading text-lg font-bold text-foreground">Escolha seu avatar</h2>
          <p className="mb-3 text-sm text-muted-foreground">Escolha entre gato fêmea e gato macho.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  <img src={avatar.src} alt={avatar.label} className="h-20 w-full rounded-lg object-cover" />
                  <p className="mt-1 text-xs font-semibold text-foreground">{avatar.label}</p>
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

        <Button className="w-full gradient-primary text-primary-foreground" onClick={saveProfile} disabled={saving}>
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      </div>
    </div>
  );
};

export default Profile;
