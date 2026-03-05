import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeAccentTheme } from "@/lib/accentTheme";

initializeAccentTheme();

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => {
          const activateUpdate = () => {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          };

          if (registration.waiting) {
            activateUpdate();
          }

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                activateUpdate();
              }
            });
          });
        })
        .catch(() => {
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
