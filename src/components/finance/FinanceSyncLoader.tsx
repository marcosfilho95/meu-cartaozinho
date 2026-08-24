import React from "react";
import { CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";

type FinanceSyncLoaderProps = {
  monthLabel?: string;
  className?: string;
};

export const FinanceSyncLoader = ({ monthLabel, className }: FinanceSyncLoaderProps) => {
  return (
    <section
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-card sm:px-5",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Carregando informações financeiras${monthLabel ? ` de ${monthLabel}` : ""}`}
    >
      <div className="finance-sync-card relative h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-900 via-primary to-emerald-600 shadow-sm">
        <span className="absolute left-2 top-2 h-2.5 w-3.5 rounded-[3px] bg-amber-200/80" />
        <CreditCard className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-white/70" aria-hidden="true" />
        <span className="finance-sync-shimmer absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          Atualizando{monthLabel ? ` ${monthLabel}` : " seus dados"}
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/10">
          <div className="finance-sync-track h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        </div>
      </div>
    </section>
  );
};
