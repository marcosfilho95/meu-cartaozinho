import React from "react";
import {
  ArrowLeftRight,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  PiggyBank,
  TrendingUp,
  Repeat,
  Upload,
  Wallet,
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
import { prefetchRoute } from "@/lib/routeLoaders";

const PRIMARY_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Início", end: true },
  { to: "/financas/fechamento", icon: ListChecks, label: "Revisão" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Lançamentos" },
  { to: "/financas/cofrinhos", icon: PiggyBank, label: "Planos" },
];

export const FINANCE_MORE_ITEMS = [
  { to: "/financas/investimentos", icon: TrendingUp, label: "Investimentos" },
  { to: "/financas/recorrencias", icon: Repeat, label: "Fixas" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
  { to: "/financas/importacoes", icon: Upload, label: "Importação avançada" },
];

export const FinanceTopNav: React.FC = () => {
  const { pathname } = useLocation();
  const moreActive = FINANCE_MORE_ITEMS.some((item) => pathname.startsWith(item.to));

  return (
    <nav aria-label="Navegação financeira" className="sticky top-3 z-30 mx-auto mb-7 mt-[-1rem] hidden max-w-6xl px-4 md:block">
      <div className="flex min-h-14 items-center gap-1 overflow-x-auto rounded-[1.15rem] border border-white/80 bg-card/95 p-1.5 shadow-[0_16px_40px_-26px_hsl(var(--foreground)/0.38)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRIMARY_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-1 shrink-0 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground transition-all duration-200 hover:bg-primary/[0.045] hover:text-primary sm:text-[12.5px]"
            activeClassName="bg-primary text-primary-foreground shadow-[0_8px_18px_-12px_hsl(var(--primary)/0.85)]"
          >
            <Icon className="h-4 w-4" strokeWidth={2.1} />
            <span>{label}</span>
          </NavLink>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex shrink-0 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-primary/[0.045] hover:text-primary focus-visible:ring-4 focus-visible:ring-primary/15 sm:text-[12.5px]",
              moreActive && "bg-primary text-primary-foreground shadow-[0_8px_18px_-12px_hsl(var(--primary)/0.85)]",
            )}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2.1} />
            <span>Mais</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {FINANCE_MORE_ITEMS.map(({ to, icon: Icon, label }) => (
              <DropdownMenuItem key={to} asChild>
                <RouterNavLink
                  to={to}
                  onMouseEnter={() => prefetchRoute(to)}
                  onFocus={() => prefetchRoute(to)}
                  onTouchStart={() => prefetchRoute(to)}
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

