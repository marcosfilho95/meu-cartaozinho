export type AccentTheme = "pink" | "blue";

const STORAGE_KEY = "accent-theme";
const THEME_ANIMATION_CLASS = "accent-theme-animating";
const THEME_ANIMATION_MS = 340;
const THEME_META_COLORS: Record<AccentTheme, { theme: string; background: string }> = {
  pink: { theme: "#e65a8d", background: "#fef6fa" },
  blue: { theme: "#57b8ea", background: "#f5faff" },
};
let themeAnimationTimer: number | null = null;
let themeAnimationRaf: number | null = null;
let manifestUrl: string | null = null;

const isValidTheme = (value: string | null): value is AccentTheme => value === "pink" || value === "blue";

const syncPwaTheme = (theme: AccentTheme) => {
  const colors = THEME_META_COLORS[theme];
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", colors.theme);

  // Keep development manifest static to avoid browser warnings with blob manifest URLs.
  if (!import.meta.env.PROD) return;

  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifestLink) return;
  const origin = window.location.origin;

  const manifestPayload = {
    name: "Meu Cartaozinho",
    short_name: "Cartaozinho",
    description: "Suas parcelas organizadas, mes a mes.",
    start_url: `${origin}/`,
    scope: `${origin}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: colors.background,
    theme_color: colors.theme,
    icons: [
      { src: `${origin}/icons/icon-${theme}-192x192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `${origin}/icons/icon-${theme}-512x512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  if (manifestUrl) URL.revokeObjectURL(manifestUrl);
  manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifestPayload)], { type: "application/manifest+json" }));
  manifestLink.setAttribute("href", manifestUrl);
};

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
  syncPwaTheme(theme);
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
