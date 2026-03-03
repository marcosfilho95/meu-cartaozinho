import { CreditCard, Landmark, Building2, Wallet } from "lucide-react";
import React from "react";

export type BankBrand = 
  | "nubank" | "c6" | "inter" | "itau" | "bradesco" 
  | "santander" | "bb" | "caixa" | "pan" | "next"
  | "neon" | "original" | "safra" | "btg" | "xp"
  | "outro";

interface BankInfo {
  name: string;
  color: string;
  bgColor: string;
}

export const BANK_MAP: Record<BankBrand, BankInfo> = {
  nubank: { name: "Nubank", color: "#8B11B0", bgColor: "#F3E5F5" },
  c6: { name: "C6 Bank", color: "#1A1A1A", bgColor: "#F5F5F5" },
  inter: { name: "Inter", color: "#FF7A00", bgColor: "#FFF3E0" },
  itau: { name: "Itaú", color: "#003399", bgColor: "#E3F2FD" },
  bradesco: { name: "Bradesco", color: "#CC2229", bgColor: "#FFEBEE" },
  santander: { name: "Santander", color: "#EC0000", bgColor: "#FFEBEE" },
  bb: { name: "Banco do Brasil", color: "#FFCC00", bgColor: "#FFFDE7" },
  caixa: { name: "Caixa", color: "#005CA9", bgColor: "#E3F2FD" },
  pan: { name: "Banco Pan", color: "#0066CC", bgColor: "#E3F2FD" },
  next: { name: "Next", color: "#00C853", bgColor: "#E8F5E9" },
  neon: { name: "Neon", color: "#00D2FF", bgColor: "#E0F7FA" },
  original: { name: "Original", color: "#00875A", bgColor: "#E8F5E9" },
  safra: { name: "Safra", color: "#003366", bgColor: "#E3F2FD" },
  btg: { name: "BTG Pactual", color: "#003366", bgColor: "#E3F2FD" },
  xp: { name: "XP", color: "#000000", bgColor: "#F5F5F5" },
  outro: { name: "Outro", color: "#9E9E9E", bgColor: "#F5F5F5" },
};

export const BANK_OPTIONS = Object.entries(BANK_MAP).map(([key, val]) => ({
  value: key as BankBrand,
  label: val.name,
}));

interface BankLogoProps {
  brand?: string | null;
  size?: number;
  className?: string;
}

export const BankLogo: React.FC<BankLogoProps> = ({ brand, size = 40, className = "" }) => {
  const bank = BANK_MAP[(brand as BankBrand) || "outro"] || BANK_MAP.outro;
  const initials = bank.name.substring(0, 2).toUpperCase();

  return (
    <div
      className={`flex items-center justify-center rounded-xl font-heading font-bold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bank.bgColor,
        color: bank.color,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
};
