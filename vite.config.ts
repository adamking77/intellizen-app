import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

const HERMES_DASHBOARD_ORIGIN = "http://127.0.0.1:9119";

/**
 * Authenticated same-origin proxy for the Hermes dashboard (voice/TTS +
 * profile catalog). The dashboard has no CORS and gates /api behind a
 * per-boot session token injected into its SPA HTML — this middleware
 * scrapes the token server-side (refreshing on 401), so it never reaches
 * the browser bundle. Dev-mode transport; the packaged app needs the
 * Tauri HTTP plugin for the same paths.
 */
function hermesDashboardProxy(): Plugin {
  let cachedToken: string | null = null;

  async function fetchToken(): Promise<string | null> {
    try {
      const html = await (await fetch(`${HERMES_DASHBOARD_ORIGIN}/`)).text();
      cachedToken = /SESSION_TOKEN__\s*=\s*"([^"]+)"/.exec(html)?.[1] ?? null;
    } catch {
      cachedToken = null;
    }
    return cachedToken;
  }

  return {
    name: "hermes-dashboard-proxy",
    configureServer(server) {
      server.middlewares.use("/hermes-dash", (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          void (async () => {
            const method = req.method ?? "GET";
            const body = ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks);
            const upstreamUrl = `${HERMES_DASHBOARD_ORIGIN}${req.url ?? "/"}`;

            async function forward(token: string | null) {
              return fetch(upstreamUrl, {
                method,
                headers: {
                  "Content-Type": String(req.headers["content-type"] ?? "application/json"),
                  ...(token ? { "X-Hermes-Session-Token": token } : {}),
                },
                body,
              });
            }

            try {
              let upstream = await forward(cachedToken ?? (await fetchToken()));
              if (upstream.status === 401) {
                upstream = await forward(await fetchToken());
              }
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
              res.end(Buffer.from(await upstream.arrayBuffer()));
            } catch (error) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: `Hermes dashboard unreachable: ${String(error)}` }));
            }
          })();
        });
      });
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const analyzeBundle = process.env.ANALYZE_BUNDLE === "1";
const isTauriRuntime = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_DEV_HOST);

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  // Release-safety guard (audit F-01): Vite inlines every VITE_* value into
  // the shipped JS bundle. A production build with the service-role key
  // embeds a full RLS-bypassing credential in a public artifact. Personal,
  // never-published builds must opt in explicitly.
  const env = loadEnv(mode, __dirname, "VITE_");
  if (command === "build" && env.VITE_SUPABASE_SERVICE_ROLE_KEY && process.env.ALLOW_SERVICE_KEY_BUILD !== "1") {
    throw new Error(
      "REFUSING TO BUILD: VITE_SUPABASE_SERVICE_ROLE_KEY would be inlined into the bundle.\n" +
        "  - For a personal, NEVER-published build: ALLOW_SERVICE_KEY_BUILD=1 pnpm tauri build ...\n" +
        "  - For a publishable build: remove the VITE_-prefixed service key and use the anon key.\n" +
        "  - Always verify artifacts with scripts/check-bundle-secrets.sh before uploading.",
    );
  }
  if (command === "build" && env.VITE_INTELLIZEN_LOCAL_ACCESS_KEY && process.env.ALLOW_LOCAL_ACCESS_KEY_BUILD !== "1") {
    throw new Error(
      "REFUSING TO BUILD: VITE_INTELLIZEN_LOCAL_ACCESS_KEY would be inlined into the bundle.\n" +
        "  - For local-only personal builds: ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm tauri build ...\n" +
        "  - For publishable builds: omit the local access key and do not point the artifact at the live GenZen OS database.",
    );
  }

  return {
  plugins: [
    react({
      fastRefresh: !isTauriRuntime,
    }),
    tailwindcss(),
    hermesDashboardProxy(),
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
    // BlockNote remains a large but isolated lazy-loaded editor payload. Keep the warning
    // threshold aligned with that accepted route-local chunk so production builds stay signal-heavy.
    chunkSizeWarningLimit: 1200,
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

          if (id.includes("@blocknote+") || id.includes("/@blocknote/")) {
            return "vendor-blocknote";
          }

          if (id.includes("@mantine+") || id.includes("/@mantine/")) {
            return "vendor-mantine";
          }

          if (
            id.includes("lucide-react") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("@dnd-kit+") ||
            id.includes("/@dnd-kit/")
          ) {
            return "vendor-ui";
          }

          if (id.includes("@tauri-apps")) {
            return "vendor-tauri";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("scheduler") ||
            id.includes("@tanstack+") ||
            id.includes("/@tanstack/") ||
            id.includes("zustand")
          ) {
            return "vendor-framework";
          }
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
    // WebKit in the Tauri dev shell can spin hard on the Vite/React refresh client.
    // Disable HMR there and fall back to clean reloads from restarted `tauri dev`.
    hmr: isTauriRuntime
      ? false
      : host
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
  };
});
