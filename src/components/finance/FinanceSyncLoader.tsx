import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type FinanceSyncLoaderProps = {
  monthLabel?: string;
  className?: string;
  /** Mensagem auxiliar exibida abaixo do título. */
  hint?: string;
  /** Ocupa a tela inteira, centralizado, com fundo translúcido. */
  overlay?: boolean;
};

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Indicador de carregamento central com anel de porcentagem.
 * A porcentagem avança de forma suave até 92% e completa em 100%
 * assim que o componente é desmontado (dados prontos).
 */
export const FinanceSyncLoader = ({ monthLabel, className, hint, overlay = false }: FinanceSyncLoaderProps) => {
  const [progress, setProgress] = useState(8);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      // curva de saturação: rápido no começo, lento perto do fim
      const next = Math.min(92, Math.round(92 * (1 - Math.exp(-elapsed / 1400))));
      setProgress((current) => (next > current ? next : current));
    }, 90);
    return () => window.clearInterval(timer);
  }, []);

  const content = (
    <section
      className={cn(
        "flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-border/70 bg-card px-6 py-9 text-center shadow-elevated",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Carregando informações financeiras${monthLabel ? ` de ${monthLabel}` : ""}`}
    >
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="9" className="stroke-primary/12" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-3xl font-bold tabular-nums text-foreground">{progress}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Carregando</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="font-heading text-lg font-bold text-foreground">
          Atualizando{monthLabel ? ` ${monthLabel}` : " seus dados"}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {hint || "Sincronizando lançamentos, faturas e planos do mês."}
        </p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );

  if (!overlay) {
    return <div className="flex w-full justify-center py-10">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-[3px]">
      {content}
    </div>
  );
};
