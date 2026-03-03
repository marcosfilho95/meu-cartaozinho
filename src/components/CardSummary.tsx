import React from "react";
import { BankLogo, BANK_MAP, BankBrand } from "@/components/BankLogo";
import { formatCurrency } from "@/lib/installments";

interface CardSummaryProps {
  card: {
    id: string;
    name: string;
    brand: string | null;
  };
  total: number;
  count: number;
  onClick: () => void;
}

export const CardSummary: React.FC<CardSummaryProps> = ({ card, total, count, onClick }) => {
  const bank = BANK_MAP[(card.brand as BankBrand) || "outro"] || BANK_MAP.outro;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-elevated hover:scale-[1.01] active:scale-[0.99] text-left"
    >
      <BankLogo brand={card.brand} size={48} />
      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-semibold text-card-foreground truncate">{card.name}</h3>
        <p className="text-sm text-muted-foreground">
          {count > 0 ? `${count} parcela${count !== 1 ? "s" : ""}` : "Sem contas"}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-heading text-lg font-bold ${total > 0 ? "text-foreground" : "text-success"}`}>
          {formatCurrency(total)}
        </p>
      </div>
    </button>
  );
};
