import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BankLogo } from "@/components/BankLogo";
import { AppLogo } from "@/components/AppLogo";
import { AppFooter } from "@/components/AppFooter";
import { formatCurrency, formatMonth } from "@/lib/installments";
import { ArrowLeft, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { getPurchasesCache, setPurchasesCache } from "@/lib/purchasesCache";
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

interface PurchasesProps {
  initialUserId?: string;
}

const Purchases: React.FC<PurchasesProps> = ({ initialUserId }) => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(initialUserId || null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialUserId) {
      setUserId(initialUserId);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, [initialUserId]);

  useEffect(() => {
    if (!userId) return;
    const cached = getPurchasesCache(userId);
    if (!cached) return;
    setPurchases(cached as Purchase[]);
    setLoading(false);
  }, [userId]);

  const fetchPurchases = useCallback(async () => {
    if (!userId) return;
    const hasCachedData = Boolean(getPurchasesCache(userId));
    if (!hasCachedData) setLoading(true);

    const { data, error } = await supabase
      .from("purchases")
      .select(
        "id, card_id, description, total_amount, installments_count, due_day, start_month, person, notes, created_at, cards(name, brand)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar compras: " + error.message);
      setLoading(false);
      return;
    }

    const next = (data as Purchase[]) || [];
    setPurchases(next);
    setPurchasesCache(userId, next);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const deletePurchase = async (purchaseId: string) => {
    const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }

    const next = purchases.filter((purchase) => purchase.id !== purchaseId);
    setPurchases(next);
    if (userId) setPurchasesCache(userId, next);
    toast.success("Compra excluida com sucesso");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="mb-3 -ml-2 gap-1 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <ShoppingBag className="h-6 w-6 text-primary-foreground" />
            <h1 className="font-heading text-xl font-bold text-primary-foreground">Minhas Compras</h1>
          </div>
        </div>
      </header>

      <div className="container -mt-4 flex-1 space-y-3 pb-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <div className="animate-fade-in py-16 text-center">
            <span className="mb-3 block text-4xl">📦</span>
            <p className="font-heading text-lg font-semibold text-foreground">Nenhuma compra cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Adicione compras pelo Dashboard ou pela tela do cartao.</p>
          </div>
        ) : (
          purchases.map((purchase) => (
            <div key={purchase.id} className="animate-fade-in rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <BankLogo brand={purchase.cards?.brand} size={40} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-card-foreground">{purchase.description}</h3>
                  <p className="text-sm text-muted-foreground">
                    {purchase.cards?.name} • {purchase.installments_count}x de{" "}
                    {formatCurrency(purchase.total_amount / purchase.installments_count)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A partir de {formatMonth(purchase.start_month)} • Dia {purchase.due_day}
                    {purchase.person && ` • ${purchase.person}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-heading font-bold text-foreground">{formatCurrency(purchase.total_amount)}</span>
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
                          Isso vai excluir "{purchase.description}" e todas as suas {purchase.installments_count} parcela(s).
                          Essa acao nao pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePurchase(purchase.id)}
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
      <AppFooter plain className="pt-0 pb-1" />
    </div>
  );
};

export default Purchases;
