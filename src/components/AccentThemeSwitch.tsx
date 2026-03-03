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

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isBlue}
        onClick={onToggle}
        className="relative flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-2 text-primary-foreground transition-all duration-200 hover:bg-primary-foreground/20 sm:h-11 sm:w-[92px]"
      >
        <Palette className="h-4 w-4 shrink-0" />
        <span
          className={`relative inline-flex h-6 w-12 shrink-0 overflow-hidden rounded-full border p-[2px] transition-all duration-300 ${
            isBlue
              ? "border-sky-200/70 bg-gradient-to-r from-sky-300 to-blue-400"
              : "border-pink-200/70 bg-gradient-to-r from-pink-300 to-rose-400"
          }`}
        >
          <span
            className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${
              isBlue ? "translate-x-[24px]" : "translate-x-0"
            }`}
          />
        </span>
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border/70 bg-card/90 px-2 py-1 shadow-sm ${
        compact ? "" : "pr-3"
      }`}
    >
      <Palette className="h-[18px] w-[18px] shrink-0 text-primary" />
      {!compact && <span className="text-[11px] font-semibold text-muted-foreground">Tema</span>}
      <button
        type="button"
        role="switch"
        aria-checked={isBlue}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-[52px] shrink-0 overflow-hidden rounded-full border p-[2px] transition-all duration-300 ${
          isBlue
            ? "border-sky-300/70 bg-gradient-to-r from-sky-300 to-blue-400"
            : "border-pink-300/70 bg-gradient-to-r from-pink-300 to-rose-400"
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-out ${
            isBlue ? "translate-x-[26px]" : "translate-x-0"
          }`}
        />
      </button>
      {!compact && <span className="min-w-[2.2rem] text-[11px] font-semibold text-foreground">{isBlue ? "Azul" : "Rosa"}</span>}
    </div>
  );
};
