import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { untypedSupabase } from "@/lib/supabaseUntyped";

interface MembersPageProps {
  userId: string;
}

type Member = {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
};

const COLORS = ["#2563EB", "#16A34A", "#E11D48", "#A855F7", "#F59E0B", "#0891B2"];

const MembersPage: React.FC<MembersPageProps> = ({ userId }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await untypedSupabase
      .from("members")
      .select("id, name, color, is_active")
      .eq("user_id", userId)
      .order("name");
    if (error) {
      toast.error(error.message);
    } else {
      setMembers((data || []) as Member[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Informe o nome do membro.");
      return;
    }

    setSaving(true);
    const { error } = await untypedSupabase.from("members").insert({
      user_id: userId,
      name: trimmed,
      color: COLORS[members.length % COLORS.length],
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Membro criado.");
    setName("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await untypedSupabase.from("members").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Membro removido.");
    load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-24">
      <Card className="border-0 shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h1 className="font-heading text-base font-bold">Membros</h1>
          </div>
          <p className="text-sm text-muted-foreground">Cadastre pessoas da família para atribuir gastos e filtrar análises. Login separado não é necessário.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Marco, Casa, Crianças" className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button disabled={saving} onClick={create} className="h-10 gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        {members.length === 0 ? (
          <Card className="border-2 border-dashed border-border sm:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum membro cadastrado.</CardContent>
          </Card>
        ) : (
          members.map((member) => (
            <Card key={member.id} className="border-0 shadow-card">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: member.color || "#94A3B8" }} />
                <p className="flex-1 font-semibold">{member.name}</p>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(member.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default MembersPage;
