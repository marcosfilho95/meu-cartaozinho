import React, { useEffect, useMemo, useState } from "react";
import { CreditCard, Radio } from "lucide-react";

import { cn } from "@/lib/utils";

type FinanceSyncLoaderProps = {
  monthLabel?: string;
  className?: string;
};

const getStep = (progress: number) => {
  if (progress < 42) return "Buscando seus lançamentos";
  if (progress < 76) return "Organizando receitas e despesas";
  return "Preparando seus indicadores";
};

export const FinanceSyncLoader = ({ monthLabel, className }: FinanceSyncLoaderProps) => {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 94) return 94;
        if (current < 52) return Math.min(current + 7, 94);
        if (current < 80) return Math.min(current + 4, 94);
        return Math.min(current + 1, 94);
      });
    }, 260);

    return () => window.clearInterval(interval);
  }, []);

  const step = useMemo(() => getStep(progress), [progress]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-elevated",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Sincronizando informações financeiras${monthLabel ? ` de ${monthLabel}` : ""}`}
    >
      <div className="grid min-h-[300px] items-center gap-8 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12">
        <div className="relative mx-auto w-full max-w-[290px] py-3">
          <div className="finance-sync-glow absolute inset-x-8 bottom-0 h-10 rounded-full bg-primary/20 blur-2xl" />
          <div className="finance-sync-card relative aspect-[1.58/1] overflow-hidden rounded-[24px] border border-white/15 bg-gradient-to-br from-emerald-950 via-primary to-emerald-700 p-5 text-primary-foreground shadow-2xl">
            <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10 bg-white/[0.06]" />
            <div className="absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-black/15" />
            <div className="relative flex items-start justify-between">
              <div className="flex h-10 w-12 items-center justify-center rounded-lg border border-amber-200/70 bg-gradient-to-br from-amber-100 to-amber-400 shadow-inner">
                <span className="h-5 w-7 rounded border border-amber-700/40 bg-amber-200/70" />
              </div>
              <Radio className="h-6 w-6 rotate-90 text-white/75" aria-hidden="true" />
            </div>
            <div className="relative mt-7">
              <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/60">Meu Cartãozinho</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="font-mono text-base tracking-[0.2em] text-white/90">•••• 2026</span>
                <CreditCard className="h-6 w-6 text-white/85" aria-hidden="true" />
              </div>
            </div>
            <div className="finance-sync-shimmer absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl text-center lg:text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Sincronização em andamento</p>
          <h2 className="mt-2 font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Atualizando seu mês{monthLabel ? ` de ${monthLabel}` : ""}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{step}. Seus números aparecem assim que estiverem prontos.</p>

          <div className="mt-7" aria-hidden="true">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-muted-foreground">Carregando informações</span>
              <strong className="text-base tabular-nums text-primary">{progress}%</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-700 via-primary to-emerald-400 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
