import React from "react";
import { Github, User } from "lucide-react";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/marcosfilho95/meu-Cartãozinho";

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
          "text-center text-xs text-muted-foreground",
          minimal
            ? "px-1 py-1"
            : plain
              ? "px-2 py-2"
              : "rounded-xl border border-border/60 bg-card/65 px-4 py-3 shadow-card backdrop-blur-sm",
        )}
      >
        <p className="flex items-center justify-center gap-1.5">
          <User className="h-3.5 w-3.5" aria-hidden />
          <span>Desenvolvido por Marcos Antonio Felix</span>
        </p>
        <p className="mt-1 flex items-center justify-center gap-1.5">
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

