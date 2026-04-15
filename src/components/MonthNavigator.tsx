import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, formatMonth } from "@/lib/installments";

interface MonthNavigatorProps {
  currentMonth: string;
  onMonthChange: (month: string) => void;
}

export const MonthNavigator: React.FC<MonthNavigatorProps> = ({
  currentMonth,
  onMonthChange,
}) => {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-2 py-1 sm:gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, -1))}
        className="h-8 w-8 rounded-full sm:h-9 sm:w-9"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
      <span className="min-w-[120px] text-center font-heading text-sm font-bold text-foreground sm:min-w-[160px] sm:text-base">
        {formatMonth(currentMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, 1))}
        className="h-8 w-8 rounded-full sm:h-9 sm:w-9"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
    </div>
  );
};
