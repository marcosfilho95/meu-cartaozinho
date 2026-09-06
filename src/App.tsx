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

const Dashboard = lazy(() => import("./pages/Dashboard"));
const CardDetail = lazy(() => import("./pages/CardDetail"));
const Purchases = lazy(() => import("./pages/Purchases"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FinanceDashboard = lazy(() => import("./pages/finance/FinanceDashboard"));
const AccountsPage = lazy(() => import("./pages/finance/AccountsPage"));
const CategoriesPage = lazy(() => import("./pages/finance/CategoriesPage"));
const TransactionsPage = lazy(() => import("./pages/finance/TransactionsPage"));
const BudgetPage = lazy(() => import("./pages/finance/BudgetPage"));
const ImportsPage = lazy(() => import("./pages/finance/ImportsPage"));
const ExpectedBillsPage = lazy(() => import("./pages/finance/ExpectedBillsPage"));
const RecurrencesPage = lazy(() => import("./pages/finance/RecurrencesPage"));
const MembersPage = lazy(() => import("./pages/finance/MembersPage"));
const ReportsPage = lazy(() => import("./pages/finance/ReportsPage"));
const CofrinhosPage = lazy(() => import("./pages/finance/CofrinhosPage"));
const MonthlyClosingPage = lazy(() => import("./pages/finance/MonthlyClosingPage"));
const InvestmentsPage = lazy(() => import("./pages/finance/InvestmentsPage"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

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

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
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

