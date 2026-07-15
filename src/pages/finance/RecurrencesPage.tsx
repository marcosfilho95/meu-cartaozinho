import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PauseCircle, PlayCircle, Repeat } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { untypedSupabase } from "@/lib/supabaseUntyped";
import { formatCurrency } from "@/lib/constants";

interface RecurrencesPageProps {
  userId: string;
}

type Recurrence = {
  id: string;
  frequency: "weekly" | "monthly" | "yearly";
  next_date: string | null;
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await untypedSupabase
      .from("recurrences")
      .select("id, frequency, next_date, is_active, template_payload")
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
              <h1 className="font-heading text-base font-bold">Recorrências</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Crie gastos ou receitas recorrentes pelo botão abaixo. Elas também entram na lista de transações.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">Nova recorrência</Button>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma recorrência criada.</CardContent>
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
                  <p className="truncate text-sm font-bold">{item.template_payload?.source || "Recorrência sem descrição"}</p>
                  <p className="text-xs text-muted-foreground">
                    {frequencyLabel[item.frequency]} · próxima: {item.next_date ? new Date(`${item.next_date}T12:00:00`).toLocaleDateString("pt-BR") : "sem data"}
                  </p>
                </div>
                <p className="font-bold">{formatCurrency(Number(item.template_payload?.amount || 0))}</p>
                <Badge variant="outline" className={item.is_active ? "border-success/30 bg-success/15 text-success" : "border-border bg-muted text-muted-foreground"}>
                  {item.is_active ? "Ativa" : "Pausada"}
                </Badge>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toggle(item)}>
                  {item.is_active ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  {item.is_active ? "Pausar" : "Ativar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddTransactionDialog key={dialogOpen ? "open" : "closed"} open={dialogOpen} onOpenChange={setDialogOpen} userId={userId} defaultType="expense" />
    </div>
  );
};

export default RecurrencesPage;
