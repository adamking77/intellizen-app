import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { runSandboxQuery, type SandboxQueryInput } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Inside Tauri the shell comes from the custom genui: protocol — Tauri
 * injects the app CSP into every HTML asset in dist at build time, which
 * would re-block the sandbox's inline scripts; protocol responses bypass
 * that injection. In a plain browser (QA) vite serves the same file.
 */
const FRAME_SRC = isTauri() ? "genui://localhost/frame.html" : "/genui-frame.html";

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
  const [attempt, setAttempt] = useState(0);
  const nonce = useMemo(() => crypto.randomUUID(), [attempt, html]);
  const [renderState, setRenderState] = useState<
    { nonce: string; status: "loading" | "ready" | "error"; message?: string }
  >(() => ({ nonce, status: "loading" }));
  const currentState = renderState.nonce === nonce ? renderState : { nonce, status: "loading" as const };

  useEffect(() => {
    setHeight(240);
    setRenderState({ nonce, status: "loading" });
    const timeout = window.setTimeout(() => {
      setRenderState((current) =>
        current.nonce === nonce && current.status === "loading"
          ? { nonce, status: "error", message: "The generated view did not finish loading." }
          : current,
      );
    }, 12_000);

    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as {
        nonce?: string;
        type?: string;
        id?: number;
        payload?: unknown;
        height?: number;
        error?: string;
      };

      if (data?.type === "genui-ready") {
        frame.contentWindow?.postMessage({ type: "render", html, nonce }, "*");
        return;
      }
      if (data?.nonce !== nonce) return;

      if (data.type === "genui-rendered") {
        window.clearTimeout(timeout);
        setRenderState({ nonce, status: "ready" });
        return;
      }
      if (data.type === "genui-error") {
        window.clearTimeout(timeout);
        setRenderState({
          nonce,
          status: "error",
          message: data.error?.trim() || "The generated view could not be rendered.",
        });
        return;
      }

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
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [nonce, html]);

  return (
    <div className="relative mt-1.5">
      {currentState.status === "loading" ? (
        <div
          className="flex min-h-28 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--base)] px-3 py-4"
          role="status"
          aria-live="polite"
        >
          <p className="font-ui text-[11px] text-[var(--overlay-1)]">Loading generated view…</p>
        </div>
      ) : null}
      {currentState.status === "error" ? (
        <div
          className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-3"
          role="alert"
        >
          <p className="font-ui text-[11.5px] font-medium text-[var(--danger)]">Generated view unavailable</p>
          <p className="mt-1 font-ui text-[10.5px] leading-relaxed text-[var(--subtext-0)]">
            {currentState.message}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
            className="mt-2 rounded-full border border-[var(--border)] px-2.5 py-1 font-ui text-[10px] font-medium text-[var(--accent)] transition-colors hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            Retry
          </button>
        </div>
      ) : null}
      <iframe
        key={nonce}
        ref={iframeRef}
        title={title ?? "Agent-generated view"}
        sandbox="allow-scripts"
        src={FRAME_SRC}
        style={{ height }}
        onError={() =>
          setRenderState({ nonce, status: "error", message: "The generated view frame could not be loaded." })
        }
        className={cn(
          "w-full rounded-md border border-[var(--border)] bg-[var(--base)]",
          currentState.status === "ready" ? "block" : "pointer-events-none absolute inset-0 opacity-0",
        )}
      />
    </div>
  );
}
