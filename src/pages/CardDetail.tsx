import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MonthNavigator } from "@/components/MonthNavigator";
import { InstallmentList } from "@/components/InstallmentList";
import { AddPurchaseDialog } from "@/components/AddPurchaseDialog";
import { BankLogo } from "@/components/BankLogo";
import { getCurrentMonth } from "@/lib/installments";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Card {
  id: string;
  name: string;
  brand: string | null;
  default_due_day: number | null;
}

const CardDetail: React.FC = () => {
  const { cardId } = useParams<{ cardId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [month, setMonth] = useState(searchParams.get("mes") || getCurrentMonth());
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id || null);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId || !cardId) return;
    setLoading(true);

    const [{ data: cardData }, { data: cardsData }, { data: instData }] = await Promise.all([
      supabase.from("cards").select("id, name, brand, default_due_day").eq("id", cardId).single(),
      supabase.from("cards").select("id, name, brand, default_due_day").eq("user_id", userId),
      supabase
        .from("installments")
        .select("id, installment_number, installments_count, due_day, amount, status, purchase_id, purchases(description, person)")
        .eq("card_id", cardId)
        .eq("ref_month", month)
        .order("due_day")
        .order("installment_number"),
    ]);

    setCard(cardData as Card | null);
    setAllCards((cardsData as Card[]) || []);
    setInstallments(instData || []);
    setLoading(false);
  }, [userId, cardId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!card || !userId) return null;

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
            <BankLogo brand={card.brand} size={48} />
            <div>
              <h1 className="font-heading text-xl font-bold text-primary-foreground">{card.name}</h1>
              <p className="text-sm text-primary-foreground/70">Fatura mensal</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container -mt-4 space-y-4">
        <div className="rounded-2xl bg-card p-4 shadow-elevated animate-fade-in">
          <div className="flex items-center justify-between">
            <MonthNavigator currentMonth={month} onMonthChange={setMonth} />
            <AddPurchaseDialog
              userId={userId}
              cards={allCards}
              onPurchaseAdded={fetchData}
              defaultCardId={cardId}
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <InstallmentList installments={installments} onUpdate={fetchData} />
        )}
      </div>
    </div>
  );
};

export default CardDetail;
