import React from "react";
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
  return (
    <div className={cn("flex items-center justify-center gradient-primary shadow-elevated", SIZE_CLASSES[size], className)}>
      <span className={cn("font-heading font-extrabold tracking-tight text-primary-foreground", size === "sm" ? "text-sm" : size === "md" ? "text-lg" : "text-2xl")}>
        MC
      </span>
    </div>
  );
};
