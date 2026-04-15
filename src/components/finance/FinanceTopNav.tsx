import React from "react";
import { useLocation } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Wallet, FolderOpen } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const NAV_ITEMS = [
  { to: "/financas", icon: LayoutDashboard, label: "Resumo" },
  { to: "/financas/transacoes", icon: ArrowLeftRight, label: "Transacoes" },
  { to: "/financas/contas", icon: Wallet, label: "Contas" },
  { to: "/financas/categorias", icon: FolderOpen, label: "Categorias" },
];

export const FinanceTopNav: React.FC = () => {
  const location = useLocation();
  const [switching, setSwitching] = React.useState(false);
  const [indicatorIndex, setIndicatorIndex] = React.useState(0);
  const activeIndex = React.useMemo(() => {
    const pathname = location.pathname;
    if (pathname.startsWith("/financas/transacoes")) return 1;
    if (pathname.startsWith("/financas/contas")) return 2;
    if (pathname.startsWith("/financas/categorias")) return 3;
    return 0;
  }, [location.pathname]);

  React.useEffect(() => {
    const previousRaw = sessionStorage.getItem("finance:topnav:index");
    const previous = previousRaw ? Number(previousRaw) : 0;
    setIndicatorIndex(Number.isNaN(previous) ? 0 : previous);
    const raf = window.requestAnimationFrame(() => {
      setIndicatorIndex(activeIndex);
      sessionStorage.setItem("finance:topnav:index", String(activeIndex));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeIndex]);

  React.useEffect(() => {
    setSwitching(true);
    const timer = window.setTimeout(() => setSwitching(false), 360);
    return () => window.clearTimeout(timer);
  }, [indicatorIndex]);

  return (
    <nav className="sticky top-0 z-30 mx-auto mb-5 mt-[-0.5rem] max-w-5xl px-4">
      <div className="relative grid grid-cols-4 rounded-2xl border border-border/60 bg-card/95 p-1 shadow-card backdrop-blur-md">
        <span
          aria-hidden
          className={`pointer-events-none absolute bottom-1 left-1 top-1 rounded-xl gradient-primary shadow-sm transition-transform duration-300 ease-out ${switching ? "finance-tab-indicator-pop" : ""}`}
          style={{
            width: "calc((100% - 0.5rem) / 4)",
            transform: `translateX(${indicatorIndex * 100}%)`,
          }}
        />
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/financas"}
            className="relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            activeClassName="text-primary-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
