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

          if (
            id.includes("react-force-graph-2d") ||
            id.includes("d3-force") ||
            id.includes("d3-quadtree") ||
            id.includes("d3-selection") ||
            id.includes("d3-zoom") ||
            id.includes("d3-drag") ||
            id.includes("d3-timer") ||
            id.includes("d3-dispatch") ||
            id.includes("d3-interpolate") ||
            id.includes("d3-color") ||
            id.includes("d3-ease") ||
            id.includes("d3-format") ||
            id.includes("d3-scale") ||
            id.includes("d3-array") ||
            id.includes("d3-path") ||
            id.includes("d3-shape")
          ) {
            return "vendor-viz";
          }

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
