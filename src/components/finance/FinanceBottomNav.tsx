import React from "react";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, ArrowLeftRight, Wallet, FolderOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Início" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
  { to: "/perfil", icon: User, label: "Perfil" },
];

export const FinanceBottomNav: React.FC = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
