import React from "react";
import { formatCurrency } from "@/lib/constants";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  currentMonth: number;
  lastMonth: number;
}

interface CategoryTableProps {
  rows: CategoryRow[];
}

export const CategoryTable: React.FC<CategoryTableProps> = ({ rows }) => {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2.5 bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Categoria</span>
        <span className="text-right">Atual</span>
        <span className="text-right">Anterior</span>
        <span className="text-center w-6">⟶</span>
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((row) => {
          const diff = row.currentMonth - row.lastMonth;
          const trend = diff > 5 ? "up" : diff < -5 ? "down" : "same";
          return (
            <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                <span className="text-sm font-medium truncate">{row.name}</span>
              </div>
              <span className="text-sm font-semibold text-right tabular-nums">
                {formatCurrency(row.currentMonth)}
              </span>
              <span className="text-xs text-muted-foreground text-right tabular-nums">
                {formatCurrency(row.lastMonth)}
              </span>
              <div className="flex justify-center w-6">
                {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-destructive" />}
                {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-success" />}
                {trend === "same" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
