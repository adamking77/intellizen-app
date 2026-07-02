import { useEffect, useMemo, useRef, useState } from "react";

import { runSandboxQuery, type SandboxQueryInput } from "@/lib/data";

/**
 * Tier-2 GenUI: agent-authored HTML rendered in a hard sandbox.
 *
 * Security invariants (mirrors agent-native's extension viewer):
 * - sandbox="allow-scripts" ONLY — never allow-same-origin. The content runs
 *   in an opaque origin with zero access to the host DOM, storage, or keys.
 * - The injected CSP meta blocks ALL network (no fetch, no external scripts,
 *   no CDN). Inline script/style only.
 * - The only capability is window.intellizen.query(...) — a postMessage
 *   bridge to the host's allowlisted, read-only, row-capped Supabase gate.
 *   Messages are validated by per-widget nonce and source window.
 */
export function SandboxedGenui({ html, title }: { html: string; title?: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(240);
  const nonce = useMemo(() => crypto.randomUUID(), []);

  const srcDoc = useMemo(() => buildShell(html, nonce), [html, nonce]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { nonce?: string; type?: string; id?: number; payload?: unknown; height?: number };
      if (data?.nonce !== nonce) return;

      if (data.type === "resize" && typeof data.height === "number") {
        setHeight(Math.min(Math.max(Math.ceil(data.height), 80), 600));
        return;
      }
      if (data.type === "query" && typeof data.id === "number") {
        void runSandboxQuery(data.payload as SandboxQueryInput)
          .then((rows) => {
            frame.contentWindow?.postMessage({ nonce, id: data.id, type: "query-result", rows }, "*");
          })
          .catch((error) => {
            frame.contentWindow?.postMessage(
              { nonce, id: data.id, type: "query-error", error: error instanceof Error ? error.message : String(error) },
              "*",
            );
          });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [nonce]);

  return (
    <iframe
      ref={iframeRef}
      title={title ?? "Agent-generated view"}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      style={{ height }}
      className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--base)]"
    />
  );
}

/** Design tokens injected so generated UI matches the app. */
const TOKEN_CSS = `
:root {
  --crust: #11111b; --mantle: #181825; --base: #1e1e2e;
  --surface-0: #313244; --surface-1: #45475a; --surface-2: #585b70;
  --text: #cdd6f4; --subtext-1: #bac2de; --subtext-0: #a6adc8;
  --overlay-2: #9399b2; --overlay-1: #7f849c; --overlay-0: #6c7086;
  --accent: #89b4fa; --accent-soft: rgba(137, 180, 250, 0.10);
  --accent-border: rgba(137, 180, 250, 0.30);
  --success: #a6e3a1; --warning: #f9e2af; --caution: #fab387;
  --danger: #f03f3f; --info: #74c7ec;
  --red: #f38ba8; --peach: #fab387; --yellow: #f9e2af; --green: #a6e3a1;
  --teal: #94e2d5; --sky: #89dceb; --blue: #89b4fa; --mauve: #cba6f7; --lavender: #b4befe;
  --border: rgba(69, 71, 90, 0.6); --border-subtle: rgba(69, 71, 90, 0.3);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 10px;
  background: var(--base); color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12.5px; line-height: 1.55;
}
`;

function buildShell(content: string, nonce: string) {
  const bridge = `
<script>
(function () {
  var NONCE = ${JSON.stringify(nonce)};
  var nextId = 1;
  var pending = {};
  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.nonce !== NONCE || typeof data.id !== "number" || !pending[data.id]) return;
    var entry = pending[data.id];
    delete pending[data.id];
    if (data.type === "query-result") entry.resolve(data.rows);
    else entry.reject(new Error(data.error || "Query failed"));
  });
  window.intellizen = {
    query: function (payload) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        pending[id] = { resolve: resolve, reject: reject };
        parent.postMessage({ nonce: NONCE, type: "query", id: id, payload: payload }, "*");
        setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject(new Error("Query timed out")); }
        }, 10000);
      });
    },
  };
  var post = function () {
    parent.postMessage({ nonce: NONCE, type: "resize", height: document.documentElement.scrollHeight }, "*");
  };
  new ResizeObserver(post).observe(document.documentElement);
  window.addEventListener("load", post);
})();
</script>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';" />
<style>${TOKEN_CSS}</style>
${bridge}
</head>
<body>
${content}
</body>
</html>`;
}
