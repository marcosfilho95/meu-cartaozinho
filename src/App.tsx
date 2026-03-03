import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyAccentTheme, getStoredAccentTheme } from "@/lib/accentTheme";
import { FirstLoginTour } from "@/components/FirstLoginTour";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import CardDetail from "./pages/CardDetail";
import Purchases from "./pages/Purchases";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const [session, setSession] = useState<any>(undefined);
  const location = useLocation();
  const navigate = useNavigate();

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
      if (event === "PASSWORD_RECOVERY" && location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
      setSession(nextSession);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, navigate]);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard initialUserId={session?.user?.id} />} />
        <Route path="/cartao/:cardId" element={<CardDetail />} />
        <Route path="/compras" element={<Purchases initialUserId={session?.user?.id} />} />
        <Route path="/perfil" element={<Profile />} />
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
