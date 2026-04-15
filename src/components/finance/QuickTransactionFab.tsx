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
        className="fixed bottom-20 right-4 z-50 h-14 gap-2 rounded-full px-6 shadow-elevated gradient-primary hover:opacity-90 transition-all duration-200 md:bottom-8 md:right-8 ring-2 ring-primary/30"
        aria-label="Nova transação"
      >
        <Plus className="h-5 w-5 text-primary-foreground" />
        <span className="text-sm font-bold text-primary-foreground">Nova transação</span>
      </Button>
      <AddTransactionDialog open={open} onOpenChange={setOpen} userId={userId} />
    </>
  );
};
