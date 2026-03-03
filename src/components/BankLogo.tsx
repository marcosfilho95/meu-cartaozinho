import React from "react";
import { BANK_MAP, BANK_OPTIONS, BankBrand } from "@/data/banks";

interface BankLogoProps {
  brand?: string | null;
  size?: number;
  className?: string;
}

export { BANK_MAP, BANK_OPTIONS };
export type { BankBrand };

export const BankLogo: React.FC<BankLogoProps> = ({ brand, size = 40, className = "" }) => {
  const bank = BANK_MAP[(brand as BankBrand) || "nubank"] || BANK_OPTIONS[0];

  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/40 bg-white/80 shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={bank.logo} alt={bank.label} className="h-full w-full object-cover" loading="lazy" />
    </div>
  );
};

