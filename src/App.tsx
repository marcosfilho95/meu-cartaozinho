import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyAccentTheme, getStoredAccentTheme } from "@/lib/accentTheme";
import { FirstLoginTour } from "@/components/FirstLoginTour";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import CardDetail from "./pages/CardDetail";
import Purchases from "./pages/Purchases";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import FinanceDashboard from "./pages/finance/FinanceDashboard";
import AccountsPage from "./pages/finance/AccountsPage";
import CategoriesPage from "./pages/finance/CategoriesPage";
import TransactionsPage from "./pages/finance/TransactionsPage";
import BudgetPage from "./pages/finance/BudgetPage";
import { FinanceLayout } from "./components/finance/FinanceLayout";

const queryClient = new QueryClient();

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
    <>
      <Routes>
        <Route path="/" element={<Home userId={session?.user?.id} />} />
        <Route path="/cards" element={<Dashboard initialUserId={session?.user?.id} />} />
        <Route path="/cartao/:cardId" element={<CardDetail />} />
        <Route path="/compras" element={<Purchases initialUserId={session?.user?.id} />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/financas" element={<FinanceLayout userId={session?.user?.id} />}>
          <Route index element={<FinanceDashboard userId={session?.user?.id} />} />
          <Route path="contas" element={<AccountsPage userId={session?.user?.id} />} />
          <Route path="categorias" element={<CategoriesPage userId={session?.user?.id} />} />
          <Route path="transacoes" element={<TransactionsPage userId={session?.user?.id} />} />
          <Route path="orcamento" element={<BudgetPage userId={session?.user?.id} />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <FirstLoginTour userId={session?.user?.id} />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

