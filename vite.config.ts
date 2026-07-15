import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // mcp-js 0.22.x externalizes Windows absolute paths as npm specifiers and
  // would overwrite the deployable Edge Function with an invalid C:\\... import.
  // Linux/CI keeps generating the bundle normally.
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    process.platform !== "win32" && mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
