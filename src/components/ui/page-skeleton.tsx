import React from "react";
import { cn } from "@/lib/utils";

/**
 * Esqueleto de página usado enquanto o conteúdo carrega.
 * Substitui o antigo spinner: mantém o layout estável e evita "pulos" na tela.
 */
export const PageSkeleton: React.FC<{ className?: string; rows?: number }> = ({ className, rows = 3 }) => (
  <div className={cn("mx-auto w-full max-w-6xl animate-fade-in space-y-4 px-4 py-6 sm:px-6", className)}>
    <div className="space-y-3">
      <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
      <div className="h-8 w-2/3 max-w-md animate-pulse rounded-lg bg-muted" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl border border-border/60 bg-muted/60" />
      ))}
    </div>
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-2xl border border-border/60 bg-muted/50" />
      ))}
    </div>
  </div>
);
