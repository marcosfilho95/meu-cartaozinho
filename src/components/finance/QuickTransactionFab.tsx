import React, { useState } from "react";
import { Plus, Sparkles, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddTransactionDialog } from "./AddTransactionDialog";
import { SmartAddDialog } from "./SmartAddDialog";
import { cn } from "@/lib/utils";

interface QuickTransactionFabProps {
  userId: string;
}

export const QuickTransactionFab: React.FC<QuickTransactionFabProps> = ({ userId }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);

  const openSmart = () => {
    setMenuOpen(false);
    setSmartOpen(true);
  };
  const openManual = () => {
    setMenuOpen(false);
    setManualOpen(true);
  };

  return (
    <>
      <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
        <div
          className={cn(
            "flex flex-col items-end gap-2 transition-all duration-200",
            menuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
          )}
        >
          <button
            onClick={openSmart}
            className="group flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-primary-foreground shadow-elevated transition-all hover:-translate-y-0.5 hover:bg-primary/95"
          >
            <span className="text-xs font-bold">Lançamento Inteligente</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
          </button>
          <button
            onClick={openManual}
            className="group flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-elevated transition-all hover:border-primary/30"
          >
            <span className="text-xs font-semibold">Preencher manualmente</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
              <PenLine className="h-4 w-4" />
            </span>
          </button>
        </div>

        <Button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-[3.25rem] w-[3.25rem] gap-2 rounded-2xl p-0 shadow-elevated transition-all duration-200 md:h-14 md:w-auto md:px-5"
          aria-label="Adicionar valor"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <>
              <X className="h-5 w-5 text-primary-foreground" />
              <span className="hidden text-sm font-bold text-primary-foreground md:inline">Fechar</span>
            </>
          ) : (
            <>
              <Plus className="h-5 w-5 text-primary-foreground" />
              <span className="hidden text-sm font-bold text-primary-foreground md:inline">Adicionar valor</span>
            </>
          )}
        </Button>
      </div>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </>
  );
};
