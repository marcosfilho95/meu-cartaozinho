import React from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  FolderOpen,
  LayoutDashboard,
  Repeat,
  Target,
  Upload,
  Users,
  Wallet,
  BarChart3,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Resumo", end: true },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/importacoes", icon: Upload, label: "Importar" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
  { to: "/financas/orcamento", icon: Target, label: "Planejamento" },
  { to: "/financas/relatorios", icon: BarChart3, label: "Relatórios" },
  { to: "/financas/previstas", icon: CalendarClock, label: "Previstas" },
  { to: "/financas/recorrencias", icon: Repeat, label: "Recorrências" },
  { to: "/financas/membros", icon: Users, label: "Membros" },
];

export const FinanceTopNav: React.FC = () => {
  return (
    <nav className="sticky top-0 z-30 mx-auto mb-5 mt-[-0.5rem] max-w-6xl px-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/95 p-1 backdrop-blur-md">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            activeClassName="bg-primary/10 text-primary"
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

