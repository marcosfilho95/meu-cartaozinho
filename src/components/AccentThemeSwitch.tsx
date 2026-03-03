import React from "react";
import { Palette } from "lucide-react";
import { AccentTheme } from "@/lib/accentTheme";

interface AccentThemeSwitchProps {
  theme: AccentTheme;
  onToggle: () => void;
  compact?: boolean;
}

export const AccentThemeSwitch: React.FC<AccentThemeSwitchProps> = ({ theme, onToggle, compact = false }) => {
  const isBlue = theme === "blue";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-2 py-1 shadow-sm ${compact ? "" : "pr-3"}`}>
      <Palette className="h-[18px] w-[18px] text-primary" />
      {!compact && <span className="text-[11px] font-semibold text-muted-foreground">Tema</span>}
      <button
        type="button"
        role="switch"
        aria-checked={isBlue}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-12 items-center rounded-full border transition-all duration-300 ${
          isBlue
            ? "border-sky-300/70 bg-gradient-to-r from-sky-300 to-blue-400"
            : "border-pink-300/70 bg-gradient-to-r from-pink-300 to-rose-400"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-300 ${
            isBlue ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
      {!compact && <span className="text-[11px] font-semibold text-foreground">{isBlue ? "Azul" : "Rosa"}</span>}
    </div>
  );
};
