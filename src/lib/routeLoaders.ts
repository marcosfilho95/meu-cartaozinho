/**
 * Carregadores de rota centralizados.
 * Permitem usar o mesmo import dinâmico no React.lazy e no pré-carregamento
 * (hover/ocioso), evitando baixar o mesmo chunk duas vezes.
 */
export const routeLoaders = {
  "/cards": () => import("@/pages/Dashboard"),
  "/cartao": () => import("@/pages/CardDetail"),
  "/compras": () => import("@/pages/Purchases"),
  "/perfil": () => import("@/pages/Profile"),
  "/financas": () => import("@/pages/finance/FinanceDashboard"),
  "/financas/fechamento": () => import("@/pages/finance/MonthlyClosingPage"),
  "/financas/contas": () => import("@/pages/finance/AccountsPage"),
  "/financas/categorias": () => import("@/pages/finance/CategoriesPage"),
  "/financas/transacoes": () => import("@/pages/finance/TransactionsPage"),
  "/financas/orcamento": () => import("@/pages/finance/BudgetPage"),
  "/financas/importacoes": () => import("@/pages/finance/ImportsPage"),
  "/financas/previstas": () => import("@/pages/finance/ExpectedBillsPage"),
  "/financas/recorrencias": () => import("@/pages/finance/RecurrencesPage"),
  "/financas/membros": () => import("@/pages/finance/MembersPage"),
  "/financas/relatorios": () => import("@/pages/finance/ReportsPage"),
  "/financas/cofrinhos": () => import("@/pages/finance/CofrinhosPage"),
  "/financas/investimentos": () => import("@/pages/finance/InvestmentsPage"),
} as const;

export type RouteKey = keyof typeof routeLoaders;

const started = new Set<string>();

/** Baixa o chunk da rota uma única vez, sem bloquear a interação atual. */
export const prefetchRoute = (key: string) => {
  if (started.has(key)) return;
  const loader = routeLoaders[key as RouteKey];
  if (!loader) return;
  started.add(key);
  void loader().catch(() => started.delete(key));
};

/** Pré-carrega as rotas mais usadas quando o navegador estiver ocioso. */
export const prefetchCommonRoutes = () => {
  const keys: RouteKey[] = ["/financas", "/financas/transacoes", "/financas/fechamento", "/cards"];
  const run = () => keys.forEach(prefetchRoute);
  if (typeof window === "undefined") return;
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else window.setTimeout(run, 1200);
};
