import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyAccentTheme, getStoredAccentTheme } from "@/lib/accentTheme";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import { FinanceLayout } from "./components/finance/FinanceLayout";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { prefetchCommonRoutes, routeLoaders } from "@/lib/routeLoaders";

const Dashboard = lazy(routeLoaders["/cards"]);
const CardDetail = lazy(routeLoaders["/cartao"]);
const Purchases = lazy(routeLoaders["/compras"]);
const Profile = lazy(routeLoaders["/perfil"]);
const NotFound = lazy(() => import("./pages/NotFound"));
const FinanceDashboard = lazy(routeLoaders["/financas"]);
const AccountsPage = lazy(routeLoaders["/financas/contas"]);
const CategoriesPage = lazy(routeLoaders["/financas/categorias"]);
const TransactionsPage = lazy(routeLoaders["/financas/transacoes"]);
const BudgetPage = lazy(routeLoaders["/financas/orcamento"]);
const ImportsPage = lazy(routeLoaders["/financas/importacoes"]);
const ExpectedBillsPage = lazy(routeLoaders["/financas/previstas"]);
const RecurrencesPage = lazy(routeLoaders["/financas/recorrencias"]);
const MembersPage = lazy(routeLoaders["/financas/membros"]);
const ReportsPage = lazy(routeLoaders["/financas/relatorios"]);
const CofrinhosPage = lazy(routeLoaders["/financas/cofrinhos"]);
const MonthlyClosingPage = lazy(routeLoaders["/financas/fechamento"]);
const InvestmentsPage = lazy(routeLoaders["/financas/investimentos"]);
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => <PageSkeleton />;

const AppRoutes = () => {
  const [session, setSession] = useState<any>(undefined);
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useLayoutEffect(() => {
    applyAccentTheme(getStoredAccentTheme());
  }, [location.pathname]);

  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isRecoveryLink = hash.includes("type=recovery") || search.includes("type=recovery");
    if (isRecoveryLink && location.pathname !== "/reset-password") {
      navigate("/reset-password", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        console.info("[Auth] Usuário deslogado");
      }
      if (event === "PASSWORD_RECOVERY" && pathnameRef.current !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
      setSession(nextSession);
      if (event === "SIGNED_IN" && nextSession) {
        try {
          const pending = sessionStorage.getItem("pendingConsentUrl");
          if (pending) {
            sessionStorage.removeItem("pendingConsentUrl");
            window.location.href = pending;
          }
        } catch {
          // sessionStorage can be unavailable in restricted browser contexts.
        }
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error("[Auth] Erro ao carregar sessao inicial", error);
          setSession(null);
          return;
        }
        setSession(data.session);
      })
      .catch((error) => {
        console.error("[Auth] Falha inesperada ao inicializar sessao", error);
        setSession(null);
      });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session) prefetchCommonRoutes();
  }, [session]);

  if (session === undefined) {
    return <PageSkeleton />;
  }

  if (!session) return <Auth />;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home userId={session?.user?.id} />} />
        <Route path="/cards" element={<Dashboard initialUserId={session?.user?.id} />} />
        <Route path="/cartao/:cardId" element={<CardDetail />} />
        <Route path="/compras" element={<Purchases initialUserId={session?.user?.id} />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/financas" element={<FinanceLayout userId={session?.user?.id} />}>
          <Route index element={<FinanceDashboard userId={session?.user?.id} />} />
          <Route path="fechamento" element={<MonthlyClosingPage userId={session?.user?.id} />} />
          <Route path="contas" element={<AccountsPage userId={session?.user?.id} />} />
          <Route path="categorias" element={<CategoriesPage userId={session?.user?.id} />} />
          <Route path="transacoes" element={<TransactionsPage userId={session?.user?.id} />} />
          <Route path="orcamento" element={<BudgetPage userId={session?.user?.id} />} />
          <Route path="importacoes" element={<ImportsPage userId={session?.user?.id} />} />
          <Route path="previstas" element={<ExpectedBillsPage userId={session?.user?.id} />} />
          <Route path="recorrencias" element={<RecurrencesPage userId={session?.user?.id} />} />
          <Route path="membros" element={<MembersPage userId={session?.user?.id} />} />
          <Route path="relatorios" element={<ReportsPage userId={session?.user?.id} />} />
          <Route path="cofrinhos" element={<CofrinhosPage userId={session?.user?.id} />} />
          <Route path="investimentos" element={<InvestmentsPage userId={session?.user?.id} />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

