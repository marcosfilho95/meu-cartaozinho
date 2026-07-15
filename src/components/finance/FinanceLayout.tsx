import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { FinanceTopNav } from "@/components/finance/FinanceTopNav";
import { FinanceBottomNav } from "@/components/finance/FinanceBottomNav";
import { QuickTransactionFab } from "@/components/finance/QuickTransactionFab";
import { useFinanceRouteTransition } from "@/hooks/use-finance-route-transition";
import { useUserHeaderProfile } from "@/hooks/use-user-header-profile";

interface FinanceLayoutProps {
  userId: string;
}

export const FinanceLayout: React.FC<FinanceLayoutProps> = ({ userId }) => {
  const headerProfile = useUserHeaderProfile(userId);
  const transitionClass = useFinanceRouteTransition();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader
        containerClassName="max-w-6xl"
        title="Organizador Financeiro"
        greeting={headerProfile.greeting}
        userName={headerProfile.firstName}
        avatarId={headerProfile.avatarId}
        avatarUrl={headerProfile.avatarUrl}
        showBack
        backTo="/"
      />

      <FinanceTopNav />

      <div key={location.pathname} className={transitionClass}>
        <Outlet />
      </div>

      <FinanceBottomNav />
      <QuickTransactionFab userId={userId} />
    </div>
  );
};
