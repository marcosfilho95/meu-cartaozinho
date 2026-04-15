import React from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/constants";

interface DistributionItem {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface ExpenseDistributionBarProps {
  items: DistributionItem[];
  total: number;
}

export const ExpenseDistributionBar: React.FC<ExpenseDistributionBarProps> = ({ items, total }) => {
  if (total <= 0 || items.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="h-4 w-full rounded-full overflow-hidden bg-muted flex">
        {items.map((item, i) => {
          const pct = (item.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={item.id}
              className={cn(
                "h-full transition-all duration-700 ease-out",
                i === 0 && "rounded-l-full",
                i === items.length - 1 && "rounded-r-full"
              )}
              style={{ width: `${pct}%`, backgroundColor: item.color }}
              title={`${item.name}: ${formatCurrency(item.value)}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
          return (
            <div key={item.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] text-muted-foreground font-medium">
                {item.name} <span className="text-foreground font-semibold">{pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
