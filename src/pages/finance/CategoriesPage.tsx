import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { Plus, Pencil, Trash2, Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { getStoredProfile } from "@/lib/profileCache";
import { getStoredAvatarId } from "@/lib/profileAvatar";

interface CategoriesPageProps { userId: string; }

const CategoriesPage: React.FC<CategoriesPageProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("expense");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const [profile, setProfile] = useState<{ name: string; avatar_id: string | null }>({ name: "", avatar_id: null });

  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("expense");
  const [color, setColor] = useState("#E65A8D");

  useEffect(() => {
    const cached = getStoredProfile(userId);
    if (cached) setProfile({ name: cached.name, avatar_id: cached.avatar_id ?? getStoredAvatarId(userId) ?? null });
  }, [userId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("categories").select("*").eq("user_id", userId).order("name");
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const openCreate = () => {
    setEditing(null); setName(""); setKind(activeTab); setColor("#E65A8D");
    setDialogOpen(true);
  };

  const openEdit = (cat: any) => {
    setEditing(cat); setName(cat.name); setKind(cat.kind); setColor(cat.color || "#E65A8D");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const payload: any = { user_id: userId, name: name.trim(), kind, color };
    if (editing) {
      const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Categoria atualizada!");
    } else {
      const { error } = await supabase.from("categories").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Categoria criada!");
    }
    setDialogOpen(false); setSaving(false); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Categoria excluída"); load();
  };

  const filtered = categories.filter((c) => c.kind === activeTab);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader
        title="Categorias"
        avatarId={profile.avatar_id}
        showBack
        backTo="/financas"
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      >
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={openCreate} className="bg-white/20 hover:bg-white/30 text-primary-foreground backdrop-blur-sm gap-1 rounded-xl">
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
      </AppHeader>

      <div className="mx-auto max-w-lg px-4 -mt-4 animate-fade-in">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
            <TabsTrigger value="expense" className="rounded-lg">Despesas</TabsTrigger>
            <TabsTrigger value="income" className="rounded-lg">Receitas</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center text-muted-foreground">
              <FolderOpen className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhuma categoria nesta aba.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((cat) => (
              <Card key={cat.id} className="border-0 shadow-card transition-all hover:shadow-elevated">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: cat.color + "18" }}>
                    <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  </div>
                  <p className="flex-1 text-sm font-medium">{cat.name}</p>
                  {!cat.is_system && (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(cat.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Despesa</SelectItem>
                    <SelectItem value="income">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Cor</Label>
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-10 p-1 cursor-pointer" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground font-semibold h-11">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FinanceBottomNav />
    </div>
  );
};

export default CategoriesPage;
