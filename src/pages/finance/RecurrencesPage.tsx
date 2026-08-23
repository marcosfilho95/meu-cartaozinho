import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PauseCircle, Pencil, PlayCircle, Repeat, StopCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";

interface RecurrencesPageProps {
  userId: string;
}

type Recurrence = {
  id: string;
  name?: string | null;
  amount?: number | null;
  day_of_month?: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  next_date: string | null;
  end_date?: string | null;
  is_active: boolean;
  template_payload: {
    source?: string;
    amount?: number;
    type?: "income" | "expense";
  } | null;
};

const frequencyLabel: Record<Recurrence["frequency"], string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

const RecurrencesPage: React.FC<RecurrencesPageProps> = ({ userId }) => {
  const [items, setItems] = useState<Recurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDay, setEditDay] = useState("1");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await untypedSupabase
      .from("recurrences")
      .select("id, name, amount, day_of_month, frequency, next_date, end_date, is_active, template_payload")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data || []) as Recurrence[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (item: Recurrence) => {
    const { error } = await untypedSupabase.from("recurrences").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(item.is_active ? "Recorrência pausada." : "Recorrência ativada.");
    load();
  };

  const openEdit = (item: Recurrence) => {
    setEditing(item);
    setEditName(item.name || item.template_payload?.source || "");
    setEditAmount(String(Number(item.amount ?? item.template_payload?.amount ?? 0)).replace(".", ","));
    setEditDay(String(item.day_of_month || 1));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const amount = Number(editAmount.replace(",", "."));
    const day = Math.max(1, Math.min(31, Number(editDay) || 1));
    if (!editName.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe nome e valor válidos.");
      return;
    }
    setSaving(true);
    const payload = { ...(editing.template_payload || {}), source: editName.trim(), amount };
    const { error } = await untypedSupabase
      .from("recurrences")
      .update({ name: editName.trim(), amount, day_of_month: day, template_payload: payload })
      .eq("id", editing.id)
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Os próximos meses foram atualizados.");
    setEditing(null);
    void load();
  };

  const stop = async (item: Recurrence) => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await untypedSupabase
      .from("recurrences")
      .update({ is_active: false, end_date: today })
      .eq("id", item.id)
      .eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Despesa fixa encerrada. Os meses anteriores foram preservados.");
    void load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pb-24">
      <Card className="border-0 shadow-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              <h1 className="font-heading text-base font-bold">Despesas fixas</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Valores que se repetem são reaproveitados automaticamente no fechamento de cada mês.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">Nova despesa fixa</Button>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma despesa fixa cadastrada.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="border-0 shadow-card">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Repeat className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.name || item.template_payload?.source || "Despesa fixa sem descrição"}</p>
                  <p className="text-xs text-muted-foreground">
                    {frequencyLabel[item.frequency]}{item.day_of_month ? ` · dia ${item.day_of_month}` : ""}{item.end_date ? ` · encerrada em ${new Date(`${item.end_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <p className="font-bold">{formatCurrency(Number(item.amount ?? item.template_payload?.amount ?? 0))}</p>
                <Badge variant="outline" className={item.is_active ? "border-success/30 bg-success/15 text-success" : "border-border bg-muted text-muted-foreground"}>
                  {item.is_active ? "Ativa" : "Pausada"}
                </Badge>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toggle(item)}>
                  {item.is_active ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  {item.is_active ? "Pausar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(item)}>
                  <Pencil className="h-3.5 w-3.5" /> Ajustar
                </Button>
                {item.is_active && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => void stop(item)}>
                    <StopCircle className="h-3.5 w-3.5" /> Encerrar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddTransactionDialog key={dialogOpen ? "open" : "closed"} open={dialogOpen} onOpenChange={setDialogOpen} userId={userId} defaultType="expense" defaultMode="recurrence" onSaved={load} />

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ajustar próximos meses</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input className="mt-1" value={editName} onChange={(event) => setEditName(event.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor</Label><Input className="mt-1" inputMode="decimal" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} /></div>
              <div><Label>Dia do mês</Label><Input className="mt-1" type="number" min={1} max={31} value={editDay} onChange={(event) => setEditDay(event.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">A mudança afeta apenas os próximos fechamentos. Valores já registrados continuam iguais.</p>
            <Button className="w-full" onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar ajuste"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurrencesPage;
