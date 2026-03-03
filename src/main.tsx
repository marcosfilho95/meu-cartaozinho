import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeAccentTheme } from "@/lib/accentTheme";

initializeAccentTheme();

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // Silent fail: app should still work without offline cache.
      });
      return;
    }

    // Prevent stale cache/HMR issues in local development.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  });
}
