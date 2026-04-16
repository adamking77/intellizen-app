import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const analyzeBundle = process.env.ANALYZE_BUNDLE === "1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(analyzeBundle
      ? [
          visualizer({
            filename: "dist/bundle-stats.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
          visualizer({
            filename: "dist/bundle-stats.json",
            template: "raw-data",
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@supabase+") || id.includes("/@supabase/")) {
            return "vendor-supabase";
          }

          // Keep the force-graph / d3 stack in Rollup's default graph.
          // Forcing those modules into a dedicated vendor chunk caused a production-only
          // initialization-order crash in the packaged Tauri app.

          if (
            id.includes("@tanstack+") ||
            id.includes("/@tanstack/") ||
            id.includes("zustand")
          ) {
            return "vendor-data";
          }

          if (
            id.includes("exa-js") ||
            id.includes("zod") ||
            id.includes("zod-to-json-schema") ||
            id.includes("iceberg-js")
          ) {
            return "vendor-exa";
          }

          if (
            id.includes("react-router@") ||
            id.includes("/react-router/") ||
            id.includes("react-router-dom")
          ) {
            return "vendor-router";
          }

          if (
            id.includes("lucide-react") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx")
          ) {
            return "vendor-ui";
          }

          if (id.includes("@tauri-apps")) {
            return "vendor-tauri";
          }

          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler")) {
            return "vendor-react";
          }

          return "vendor-misc";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
