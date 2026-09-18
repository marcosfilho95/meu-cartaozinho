import React, { useState } from "react";
import { ArrowLeftRight, LayoutDashboard, ListChecks, MoreHorizontal, PiggyBank } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { NavLink as RouterNavLink } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FINANCE_MORE_ITEMS } from "@/components/finance/FinanceTopNav";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/routeLoaders";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Início" },
  { to: "/financas/fechamento", icon: ListChecks, label: "Revisão", primary: true },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Lançamentos" },
  { to: "/financas/cofrinhos", icon: PiggyBank, label: "Planos" },
];

const itemClass = "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-muted-foreground transition-all";

export const FinanceBottomNav: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav className="fixed bottom-2 left-2 right-2 z-40 mx-auto max-w-lg rounded-[1.4rem] border border-white/80 bg-card/95 p-1.5 shadow-[0_20px_45px_-22px_hsl(var(--foreground)/0.48)] backdrop-blur-xl safe-area-bottom md:hidden">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(({ to, icon: Icon, label, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className={itemClass}
            activeClassName="bg-primary text-primary-foreground shadow-[0_8px_18px_-13px_hsl(var(--primary)/0.9)]"
          >
            <Icon className="h-5 w-5" strokeWidth={primary ? 2.25 : 1.8} />
            <span className="max-w-full truncate text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className={itemClass}>
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
            <span className="max-w-full truncate text-[10px] font-medium">Mais</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="font-heading text-base">Mais opções</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid gap-2 pb-4">
              {FINANCE_MORE_ITEMS.map(({ to, icon: Icon, label }) => (
                <RouterNavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  onMouseEnter={() => prefetchRoute(to)}
                  onFocus={() => prefetchRoute(to)}
                  onTouchStart={() => prefetchRoute(to)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3 text-sm font-medium transition hover:bg-muted/50",
                      isActive && "border-primary/30 bg-primary/10 text-primary",
                    )
                  }
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  {label}
                </RouterNavLink>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
