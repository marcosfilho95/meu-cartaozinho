import React, { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BankLogo } from "@/components/BankLogo";
import { formatCurrency } from "@/lib/installments";

interface PurchaseNotificationsPopoverProps {
  userId: string;
}

type PurchaseNotification = {
  id: string;
  description: string;
  total_amount: number;
  installments_count: number;
  created_at: string;
  cards?: {
    name: string;
    brand: string | null;
  } | null;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const PurchaseNotificationsPopover: React.FC<PurchaseNotificationsPopoverProps> = ({ userId }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PurchaseNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("purchases")
        .select("id, description, total_amount, installments_count, created_at, cards(name, brand)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error) {
        setItems((data as PurchaseNotification[]) || []);
      }
      setLoading(false);
    };

    load();
  }, [open, userId]);

  const total = useMemo(() => items.length, [items]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
          aria-label="Notificacoes de compra"
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] rounded-2xl border-border/70 bg-card p-0 shadow-elevated">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
          <p className="text-sm font-bold text-foreground">Notificacoes de compra</p>
          <Badge variant="outline" className="text-[10px]">
            {total} recentes
          </Badge>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">Sem compras recentes.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 p-2.5">
                  <BankLogo brand={item.cards?.brand || "nubank"} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.description || "Compra no cartao"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.cards?.name || "Cartao"} · {item.installments_count}x
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatTime(item.created_at)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-foreground">{formatCurrency(Number(item.total_amount || 0))}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

