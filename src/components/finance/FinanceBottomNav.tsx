import React from "react";
import { ArrowLeftRight, LayoutDashboard, Target, Upload, Wallet } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Início" },
  { to: "/financas/orcamento", icon: Target, label: "Orçamento" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/importacoes", icon: Upload, label: "Importar" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
];

export const FinanceBottomNav: React.FC = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md safe-area-bottom md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

