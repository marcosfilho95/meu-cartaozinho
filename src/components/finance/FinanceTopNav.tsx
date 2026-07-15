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
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PRIMARY_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Resumo", end: true },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transações" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/orcamento", icon: Target, label: "Planejamento" },
  { to: "/financas/relatorios", icon: BarChart3, label: "Relatórios" },
];

const MORE_ITEMS = [
  { to: "/financas/importacoes", icon: Upload, label: "Importar" },
  { to: "/financas/previstas", icon: CalendarClock, label: "Previstas" },
  { to: "/financas/recorrencias", icon: Repeat, label: "Recorrências" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
  { to: "/financas/membros", icon: Users, label: "Membros" },
];

export const FinanceTopNav: React.FC = () => {
  const { pathname } = useLocation();
  const moreActive = MORE_ITEMS.some((item) => pathname.startsWith(item.to));

  return (
    <nav className="sticky top-0 z-30 mx-auto mb-5 mt-[-0.5rem] max-w-6xl px-4">
      <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/95 p-1 backdrop-blur-md">
        {PRIMARY_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            activeClassName="bg-primary/10 text-primary"
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40",
              moreActive && "bg-primary/10 text-primary",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Mais</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {MORE_ITEMS.map(({ to, icon: Icon, label }) => (
              <DropdownMenuItem key={to} asChild>
                <RouterNavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex w-full cursor-pointer items-center gap-2 text-sm",
                      isActive && "bg-primary/10 text-primary",
                    )
                  }
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  <span>{label}</span>
                </RouterNavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};

