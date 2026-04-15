import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { useFinanceRouteTransition } from "@/hooks/use-finance-route-transition";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { syncAllCardPurchasesToFinance } from "@/lib/financeCardSync";

interface FinanceLayoutProps {
  userId: string;
}

export const FinanceLayout: React.FC<FinanceLayoutProps> = ({ userId }) => {
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const headerProfile = useUserHeaderProfile(userId);
  const transitionClass = useFinanceRouteTransition();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      try {
        await syncAllCardPurchasesToFinance(userId);
      } catch (error) {
        if (!mounted) return;
        console.error("[FinanceSync] Falha ao sincronizar compras do Meu Cartaozinho", error);
      }
    };
    sync();
    return () => {
      mounted = false;
    };
  }, [userId]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader
        containerClassName="max-w-6xl"
        title="Organizador Financeiro"
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        showBack
        backTo="/"
        accentTheme={accentTheme}
        onToggleTheme={() => setAccentTheme((prev) => toggleAccentTheme(prev))}
      />

      <FinanceTopNav />

      <div key={location.pathname} className={transitionClass}>
        <Outlet />
      </div>

      <QuickTransactionFab userId={userId} />
    </div>
  );
};
