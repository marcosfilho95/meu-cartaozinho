// Tema único: Emerald Prestige. O antigo alternador pink/blue foi removido.
// Este módulo mantém as mesmas exports como no-op para compatibilidade retroativa.

export type AccentTheme = "emerald";

const STORAGE_KEY = "accent-theme";

const clearLegacyTheme = () => {
  try {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored !== "emerald") localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-accent-theme");
  } catch {
    // ignore
  }
};

export const applyAccentTheme = (_theme?: AccentTheme) => {
  clearLegacyTheme();
};

export const getStoredAccentTheme = (): AccentTheme => "emerald";

export const initializeAccentTheme = (): AccentTheme => {
  clearLegacyTheme();
  return "emerald";
};

export const toggleAccentTheme = (_current: AccentTheme): AccentTheme => "emerald";
