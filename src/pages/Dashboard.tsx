import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { CardSummary } from "@/components/CardSummary";
import { AddCardDialog } from "@/components/AddCardDialog";
import { AddPurchaseDialog } from "@/components/AddPurchaseDialog";
import { getCurrentMonth, formatCurrency, formatMonth } from "@/lib/installments";
import { Button } from "@/components/ui/button";
import { CreditCard, LogOut, ShoppingBag, Plus } from "lucide-react";
import { toast } from "sonner";

interface Card {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [totals, setTotals] = useState<Record<string, { total: number; count: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data: cardsData } = await supabase
      .from("cards")
      .select("id, name, brand, default_due_day")
      .eq("user_id", userId)
      .order("created_at");

    setCards((cardsData as Card[]) || []);

    // Get installment totals per card for this month
    const { data: installments } = await supabase
      .from("installments")
      .select("card_id, amount")
      .eq("user_id", userId)
      .eq("ref_month", month);

    const t: Record<string, { total: number; count: number }> = {};
    (installments || []).forEach((inst) => {
      if (!t[inst.card_id]) t[inst.card_id] = { total: 0, count: 0 };
      t[inst.card_id].total += Number(inst.amount);
      t[inst.card_id].count += 1;
    });
    setTotals(t);
    setLoading(false);
  }, [userId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grandTotal = Object.values(totals).reduce((sum, t) => sum + t.total, 0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo! 👋");
  };

  if (!userId) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-primary px-4 pb-8 pt-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/20">
              <CreditCard className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-xl font-bold text-primary-foreground">Minhas Faturas</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/compras")}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ShoppingBag className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container -mt-4 space-y-6">
        {/* Total card */}
        <div className="rounded-2xl bg-card p-5 shadow-elevated animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
          </div>
          <div className="text-center mt-2">
            <p className="text-sm text-muted-foreground">Total do mês</p>
            <p className="font-heading text-3xl font-bold text-foreground">{formatCurrency(grandTotal)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <AddCardDialog userId={userId} onCardAdded={fetchData} />
          {cards.length > 0 && (
            <AddPurchaseDialog userId={userId} cards={cards} onPurchaseAdded={fetchData} />
          )}
        </div>

        {/* Cards list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <CreditCard className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Bem-vinda! 💖</h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Comece cadastrando um cartão. Depois, adicione compras parceladas e veja suas faturas organizadas por mês.
            </p>
            <AddCardDialog
              userId={userId}
              onCardAdded={fetchData}
              trigger={
                <Button className="mt-4 gradient-primary text-primary-foreground gap-2">
                  <Plus className="h-4 w-4" />
                  Cadastrar primeiro cartão
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-foreground">Seus Cartões</h2>
            {cards.map((card) => (
              <CardSummary
                key={card.id}
                card={card}
                total={totals[card.id]?.total || 0}
                count={totals[card.id]?.count || 0}
                onClick={() => navigate(`/cartao/${card.id}?mes=${month}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
