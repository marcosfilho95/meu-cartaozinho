import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BankLogo } from "@/components/BankLogo";
import { formatCurrency, formatMonth } from "@/lib/installments";
import { ArrowLeft, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Purchase {
  id: string;
  card_id: string;
  description: string;
  total_amount: number;
  installments_count: number;
  due_day: number;
  start_month: string;
  person: string | null;
  notes: string | null;
  created_at: string;
  cards: { name: string; brand: string | null } | null;
}

const Purchases: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, []);

  const fetchPurchases = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("purchases")
      .select("*, cards(name, brand)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    setPurchases((data as Purchase[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const deletePurchase = async (purchaseId: string) => {
    // Installments are CASCADE deleted
    const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Compra excluída com sucesso");
    fetchPurchases();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="mb-3 text-primary-foreground hover:bg-primary-foreground/10 gap-1 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-primary-foreground" />
            <h1 className="font-heading text-xl font-bold text-primary-foreground">Minhas Compras</h1>
          </div>
        </div>
      </header>

      <div className="container -mt-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <span className="text-4xl mb-3">📦</span>
            <p className="font-heading text-lg font-semibold text-foreground">Nenhuma compra cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1">Adicione compras pelo Dashboard ou pela tela do cartão.</p>
          </div>
        ) : (
          purchases.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-card animate-fade-in">
              <div className="flex items-start gap-3">
                <BankLogo brand={p.cards?.brand} size={40} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-card-foreground truncate">{p.description}</h3>
                  <p className="text-sm text-muted-foreground">
                    {p.cards?.name} • {p.installments_count}x de {formatCurrency(p.total_amount / p.installments_count)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A partir de {formatMonth(p.start_month)} • Dia {p.due_day}
                    {p.person && ` • ${p.person}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-heading font-bold text-foreground">{formatCurrency(p.total_amount)}</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading">Excluir compra?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso vai excluir "{p.description}" e todas as suas {p.installments_count} parcela(s). Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePurchase(p.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Purchases;
