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
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, -1))}
        className="rounded-full"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <span className="min-w-[160px] text-center font-heading text-lg font-semibold text-foreground">
        {formatMonth(currentMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(addMonths(currentMonth, 1))}
        className="rounded-full"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
};
