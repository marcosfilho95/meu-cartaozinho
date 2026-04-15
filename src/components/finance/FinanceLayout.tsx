import React from "react";
import { AppHeader } from "@/components/AppHeader";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { useFinanceRouteTransition } from "@/hooks/use-finance-route-transition";
import { AccentTheme, getStoredAccentTheme, toggleAccentTheme } from "@/lib/accentTheme";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";
import { useState } from "react";

interface FinanceLayoutProps {
  userId: string;
  children: React.ReactNode;
  headerChildren?: React.ReactNode;
  showFab?: boolean;
}

export const FinanceLayout: React.FC<FinanceLayoutProps> = ({
  userId,
  children,
  headerChildren,
  showFab = true,
}) => {
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => getStoredAccentTheme());
  const headerProfile = useUserHeaderProfile(userId);
  const transitionClass = useFinanceRouteTransition();

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
      >
        {headerChildren}
      </AppHeader>

      <FinanceTopNav />

      <div key={transitionClass} className={transitionClass}>
        {children}
      </div>

      {showFab && <QuickTransactionFab userId={userId} />}
    </div>
  );
};
