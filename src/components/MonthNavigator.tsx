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
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/80 p-1 shadow-[0_1px_1px_hsl(var(--foreground)/0.025)] sm:gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, -1))}
        className="h-8 w-8 rounded-lg shadow-none sm:h-9 sm:w-9"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
      <span className="min-w-[120px] text-center text-xs font-semibold capitalize text-foreground sm:min-w-[150px] sm:text-sm">
        {formatMonth(currentMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, 1))}
        className="h-8 w-8 rounded-lg shadow-none sm:h-9 sm:w-9"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
    </div>
  );
};
