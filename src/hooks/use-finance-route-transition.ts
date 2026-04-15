import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const FINANCE_ROUTE_INDEX_KEY = "finance:route:index";

const getFinanceRouteIndex = (pathname: string) => {
  if (pathname.startsWith("/financas/transacoes")) return 1;
  if (pathname.startsWith("/financas/contas")) return 2;
  if (pathname.startsWith("/financas/categorias")) return 3;
  return 0;
};

export const useFinanceRouteTransition = () => {
  const location = useLocation();
  const currentIndex = useMemo(() => getFinanceRouteIndex(location.pathname), [location.pathname]);
  const [transitionClass, setTransitionClass] = useState("finance-page-ready");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousRaw = window.sessionStorage.getItem(FINANCE_ROUTE_INDEX_KEY);
    const previousIndex = previousRaw === null ? null : Number(previousRaw);
    let nextClass = "finance-page-enter";

    if (previousIndex === null || Number.isNaN(previousIndex) || previousIndex === currentIndex) {
      nextClass = "finance-page-enter";
    } else if (currentIndex > previousIndex) {
      nextClass = "finance-page-enter-right";
    } else {
      nextClass = "finance-page-enter-left";
    }

    setTransitionClass(nextClass);
    window.sessionStorage.setItem(FINANCE_ROUTE_INDEX_KEY, String(currentIndex));

    const timer = window.setTimeout(() => {
      setTransitionClass("finance-page-ready");
    }, 320);

    return () => window.clearTimeout(timer);
  }, [currentIndex]);

  return transitionClass;
};
