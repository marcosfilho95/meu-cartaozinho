import React from "react";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, ArrowLeftRight, Wallet, FolderOpen } from "lucide-react";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Início" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
];

export const FinanceTopNav: React.FC = () => {
  return (
    <nav className="mx-auto max-w-lg px-4 -mt-4 mb-4">
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-card/80 backdrop-blur-md p-1 shadow-card">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-muted-foreground transition-colors text-[11px] font-medium hover:bg-muted/50"
            activeClassName="gradient-primary text-primary-foreground shadow-sm"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
