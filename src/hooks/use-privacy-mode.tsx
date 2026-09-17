import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const PRIVACY_STORAGE_KEY = "cartaozinho:privacy-mode";

interface PrivacyModeContextValue {
  isPrivate: boolean;
  togglePrivacy: () => void;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

const readStoredPrivacy = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const PrivacyModeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isPrivate, setIsPrivate] = useState(readStoredPrivacy);

  useEffect(() => {
    document.documentElement.dataset.privacyMode = isPrivate ? "true" : "false";
    try {
      window.localStorage.setItem(PRIVACY_STORAGE_KEY, String(isPrivate));
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
    return () => {
      delete document.documentElement.dataset.privacyMode;
    };
  }, [isPrivate]);

  const value = useMemo(() => ({ isPrivate, togglePrivacy: () => setIsPrivate((current) => !current) }), [isPrivate]);

  return <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>;
};

export const usePrivacyMode = () => {
  const context = useContext(PrivacyModeContext);
  if (!context) throw new Error("usePrivacyMode must be used within PrivacyModeProvider");
  return context;
};

interface PrivacyValueProps {
  children: React.ReactNode;
  className?: string;
  maskedLabel?: string;
}

export const PrivacyValue: React.FC<PrivacyValueProps> = ({ children, className, maskedLabel = "Valor oculto" }) => {
  const { isPrivate } = usePrivacyMode();
  return (
    <span className={cn("privacy-value inline-block transition-[filter] duration-200", className)} aria-label={isPrivate ? maskedLabel : undefined}>
      {isPrivate ? "••••" : children}
    </span>
  );
};
