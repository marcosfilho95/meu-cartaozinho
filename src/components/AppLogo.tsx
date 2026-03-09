import React, { useEffect, useState } from "react";
import { AccentTheme, getStoredAccentTheme } from "@/lib/accentTheme";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AppLogoProps["size"]>, string> = {
  sm: "h-10 w-10 rounded-2xl",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-20 w-20 rounded-3xl",
};

export const AppLogo: React.FC<AppLogoProps> = ({ size = "md", className }) => {
  const [theme, setTheme] = useState<AccentTheme>(() => getStoredAccentTheme());

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const accentEvent = event as CustomEvent<AccentTheme>;
      setTheme(accentEvent.detail);
    };
    window.addEventListener("accent-theme-change", handleThemeChange as EventListener);
    return () => window.removeEventListener("accent-theme-change", handleThemeChange as EventListener);
  }, []);

  return (
    <div className={cn("overflow-hidden shadow-elevated", SIZE_CLASSES[size], className)}>
      <img
        src={`/icons/icon-${theme}.svg`}
        alt="Meu Cartãozinho"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
};
