import { useEffect, useMemo, useRef, useState } from "react";

import { runSandboxQuery, type SandboxQueryInput } from "@/lib/data";

/**
 * Tier-2 GenUI: agent-authored HTML rendered in a hard sandbox.
 *
 * Security invariants (mirrors agent-native's extension viewer):
 * - sandbox="allow-scripts" ONLY — never allow-same-origin. The content runs
 *   in an opaque origin with zero access to the host DOM, storage, or keys.
 * - The frame document (/genui-frame.html) carries its own CSP that blocks
 *   ALL network (no fetch, no external scripts, no CDN). Inline only.
 * - The only capability is window.intellizen.query(...) — a postMessage
 *   bridge to the host's allowlisted, read-only, row-capped Supabase gate.
 *   Messages are validated by per-widget nonce and source window.
 *
 * The shell is loaded via src (a real HTTP document), not srcdoc: WKWebView
 * inherits the host app's CSP into srcdoc/blob/about:blank frames, which
 * silently kills the widget's inline scripts inside Tauri. A separate HTTP
 * document carries only its own CSP. Content arrives via a ready/render
 * postMessage handshake, which also hands the frame its nonce.
 */
export function SandboxedGenui({ html, title }: { html: string; title?: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(240);
  const nonce = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { nonce?: string; type?: string; id?: number; payload?: unknown; height?: number };

      if (data?.type === "genui-ready") {
        frame.contentWindow?.postMessage({ type: "render", html, nonce }, "*");
        return;
      }
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
  }, [nonce, html]);

  return (
    <iframe
      ref={iframeRef}
      title={title ?? "Agent-generated view"}
      sandbox="allow-scripts"
      src="/genui-frame.html"
      style={{ height }}
      className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--base)]"
    />
  );
}
