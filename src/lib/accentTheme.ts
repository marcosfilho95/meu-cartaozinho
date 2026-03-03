export type AccentTheme = "pink" | "blue";

const STORAGE_KEY = "accent-theme";
const THEME_ANIMATION_CLASS = "accent-theme-animating";
const THEME_ANIMATION_MS = 340;
let themeAnimationTimer: number | null = null;
let themeAnimationRaf: number | null = null;

const isValidTheme = (value: string | null): value is AccentTheme => value === "pink" || value === "blue";

export const applyAccentTheme = (theme: AccentTheme) => {
  const root = document.documentElement;
  root.classList.add(THEME_ANIMATION_CLASS);
  if (themeAnimationRaf) window.cancelAnimationFrame(themeAnimationRaf);
  // Let transition rules apply first, then switch theme in the next frame.
  themeAnimationRaf = window.requestAnimationFrame(() => {
    root.setAttribute("data-accent-theme", theme);
    themeAnimationRaf = null;
  });
  if (themeAnimationTimer) window.clearTimeout(themeAnimationTimer);
  themeAnimationTimer = window.setTimeout(() => {
    root.classList.remove(THEME_ANIMATION_CLASS);
    themeAnimationTimer = null;
  }, THEME_ANIMATION_MS);
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
