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
      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
        <div
          className={cn(
            "flex flex-col items-end gap-2 transition-all duration-200",
            menuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
          )}
        >
          <button
            onClick={openSmart}
            className="group flex items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-elevated ring-1 ring-border/60 transition-all hover:ring-primary/40"
          >
            <span className="text-xs font-semibold">Adicionar com IA</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full gradient-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
          </button>
          <button
            onClick={openManual}
            className="group flex items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-elevated ring-1 ring-border/60 transition-all hover:ring-primary/40"
          >
            <span className="text-xs font-semibold">Manual</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
              <PenLine className="h-4 w-4" />
            </span>
          </button>
        </div>

        <Button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-14 gap-2 rounded-full px-6 shadow-elevated gradient-primary hover:opacity-90 transition-all duration-200 ring-2 ring-primary/30"
          aria-label="Nova transação"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <>
              <X className="h-5 w-5 text-primary-foreground" />
              <span className="text-sm font-bold text-primary-foreground">Fechar</span>
            </>
          ) : (
            <>
              <Plus className="h-5 w-5 text-primary-foreground" />
              <span className="text-sm font-bold text-primary-foreground">Nova transação</span>
            </>
          )}
        </Button>
      </div>

      <AddTransactionDialog open={manualOpen} onOpenChange={setManualOpen} userId={userId} />
      <SmartAddDialog open={smartOpen} onOpenChange={setSmartOpen} userId={userId} />
    </>
  );
};
