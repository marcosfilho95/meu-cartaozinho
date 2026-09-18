import React from "react";
import { Github } from "lucide-react";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/marcosfilho95/meu-cartaozinho";

interface AppFooterProps {
  useContainer?: boolean;
  className?: string;
  minimal?: boolean;
  plain?: boolean;
}

export const AppFooter: React.FC<AppFooterProps> = ({ useContainer = true, className, minimal = false, plain = false }) => {
  return (
    <footer className={cn(useContainer ? "container pb-6 pt-2" : "w-full pb-6 pt-2", className)}>
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground sm:flex-row sm:gap-2",
          minimal
            ? "px-1 py-1"
            : plain
              ? "px-2 py-2"
              : "rounded-2xl border border-border/50 bg-card/55 px-4 py-3 backdrop-blur-sm",
        )}
      >
        <p>Desenvolvido por Marcos Antonio Felix</p>
        <span className="hidden text-border sm:inline" aria-hidden>•</span>
        <p className="flex items-center justify-center gap-1.5">
          <Github className="h-3.5 w-3.5" aria-hidden />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Repositório no GitHub
          </a>
        </p>
      </div>
    </footer>
  );
};

