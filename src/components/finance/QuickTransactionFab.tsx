import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddTransactionDialog } from "./AddTransactionDialog";

interface QuickTransactionFabProps {
  userId: string;
}

export const QuickTransactionFab: React.FC<QuickTransactionFabProps> = ({ userId }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-50 h-12 gap-2 rounded-full px-5 shadow-elevated gradient-primary hover:opacity-90 transition-all duration-200 md:right-8"
        aria-label="Nova transação"
      >
        <Plus className="h-5 w-5 text-primary-foreground" />
        <span className="text-sm font-semibold text-primary-foreground">Nova Transação</span>
      </Button>
      <AddTransactionDialog open={open} onOpenChange={setOpen} userId={userId} />
    </>
  );
};
