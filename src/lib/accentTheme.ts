export type AccentTheme = "pink" | "blue";

const STORAGE_KEY = "accent-theme";

const isValidTheme = (value: string | null): value is AccentTheme => value === "pink" || value === "blue";

export const applyAccentTheme = (theme: AccentTheme) => {
  document.documentElement.setAttribute("data-accent-theme", theme);
};

export const getStoredAccentTheme = (): AccentTheme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isValidTheme(stored) ? stored : "pink";
};

export const initializeAccentTheme = (): AccentTheme => {
  const theme = getStoredAccentTheme();
  applyAccentTheme(theme);
  return theme;
};

export const toggleAccentTheme = (current: AccentTheme): AccentTheme => {
  const next: AccentTheme = current === "pink" ? "blue" : "pink";
  localStorage.setItem(STORAGE_KEY, next);
  applyAccentTheme(next);
  return next;
};

