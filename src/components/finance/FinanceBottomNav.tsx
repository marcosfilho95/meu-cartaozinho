import React from "react";
import { ArrowLeftRight, LayoutDashboard, Upload, Wallet } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Resumo" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/importacoes", icon: Upload, label: "Importar", primary: true },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
];

export const FinanceBottomNav: React.FC = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md safe-area-bottom md:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className={
              primary
                ? "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-primary"
                : "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-muted-foreground transition-colors"
            }
            activeClassName="text-primary"
          >
            {primary ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </span>
            ) : (
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            )}
            <span className="max-w-full truncate text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

