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
  { to: "/financas/previstas", icon: CalendarClock, label: "Previstas" },
  { to: "/financas/recorrencias", icon: Repeat, label: "Recorrências" },
  { to: "/financas/orcamento", icon: Target, label: "Orçamento" },
  { to: "/financas/relatorios", icon: BarChart3, label: "Relatórios" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
  { to: "/financas/membros", icon: Users, label: "Membros" },
];

export const FinanceTopNav: React.FC = () => {
  return (
    <nav className="sticky top-0 z-30 mx-auto mb-5 mt-[-0.5rem] max-w-6xl px-4">
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/95 p-1 shadow-card backdrop-blur-md">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
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

