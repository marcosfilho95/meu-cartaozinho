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
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-elevated gradient-primary hover:opacity-90 transition-all duration-200 md:bottom-8 md:right-8"
        size="icon"
        aria-label="Nova transação"
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
      </Button>
      <AddTransactionDialog open={open} onOpenChange={setOpen} userId={userId} />
    </>
  );
};
