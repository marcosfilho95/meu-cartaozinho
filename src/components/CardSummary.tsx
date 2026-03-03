import React from "react";
import { BankLogo } from "@/components/BankLogo";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency } from "@/lib/installments";

interface CardSummaryProps {
  card: {
    id: string;
    name: string;
    brand: string | null;
  };
  total: number;
  count: number;
  avatarId?: string | null;
  userName?: string | null;
  onClick: () => void;
}

export const CardSummary: React.FC<CardSummaryProps> = ({ card, total, count, avatarId, userName, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-border/90 bg-card p-4 text-left shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.995]"
    >
      <BankLogo brand={card.brand} size={52} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-heading text-lg font-bold text-card-foreground">{card.name}</h3>
        <p className="text-sm text-muted-foreground">
          {count > 0 ? `${count} parcela(s) no mês` : "Nenhuma conta para este mês"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className={`font-heading text-lg font-bold ${total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {formatCurrency(total)}
          </p>
        </div>
        <UserAvatar avatarId={avatarId} name={userName} size={32} className="opacity-90 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
};
