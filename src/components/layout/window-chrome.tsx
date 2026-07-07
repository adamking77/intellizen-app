import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

export const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Pane material: solid app surfaces; the floating look comes from the
 * transparent gutters around them, not from translucent panes. */
export const PANE_BG = "var(--base)" as const;
export const PANE_BG_RAISED = "var(--mantle)" as const;

/**
 * JS-driven window drag (sogo pattern): more reliable than
 * data-tauri-drag-region, and it skips interactive elements so the same bar
 * can hold buttons. Attach to onMouseDown of any chrome strip.
 */
export function useWindowDrag() {
  return useCallback((event: React.MouseEvent) => {
    if (!isTauriRuntime || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, a, select, textarea, [role='button']")) return;
    void getCurrentWindow()
      .startDragging()
      .catch((err) => toastError("Window drag failed", err));
  }, []);
}

type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

const RESIZE_ZONES: Array<{ dir: ResizeDirection; className: string; cursor: string }> = [
  { dir: "North", className: "left-4 right-4 top-0 h-2", cursor: "ns-resize" },
  { dir: "South", className: "bottom-0 left-4 right-4 h-2", cursor: "ns-resize" },
  { dir: "West", className: "bottom-4 left-0 top-4 w-2", cursor: "ew-resize" },
  { dir: "East", className: "bottom-4 right-0 top-4 w-2", cursor: "ew-resize" },
  { dir: "NorthWest", className: "left-0 top-0 h-4 w-4", cursor: "nwse-resize" },
  { dir: "NorthEast", className: "right-0 top-0 h-4 w-4", cursor: "nesw-resize" },
  { dir: "SouthWest", className: "bottom-0 left-0 h-4 w-4", cursor: "nesw-resize" },
  { dir: "SouthEast", className: "bottom-0 right-0 h-4 w-4", cursor: "nwse-resize" },
];

const WINDOW_MIN_WIDTH = 900;
const WINDOW_MIN_HEIGHT = 620;

async function readWindowFrame() {
  const appWindow = getCurrentWindow();
  const [size, scaleFactor, position] = await Promise.all([
    appWindow.innerSize(),
    appWindow.scaleFactor(),
    appWindow.outerPosition(),
  ]);
  return {
    appWindow,
    width: size.width / scaleFactor,
    height: size.height / scaleFactor,
    x: position.x / scaleFactor,
    y: position.y / scaleFactor,
  };
}

type WindowFrame = Awaited<ReturnType<typeof readWindowFrame>>;

/**
 * Manual window resize: tao's startResizeDragging is a no-op on macOS, so we
 * track the pointer and drive setSize/setPosition ourselves.
 *
 * - Listeners attach synchronously with pointer capture on the grip element,
 *   so the gesture starts instantly and pointerup can never be lost while the
 *   window is being mutated (the lost-mouseup is what caused resize to keep
 *   following the cursor after release).
 * - The window frame is read asynchronously in parallel; moves arriving
 *   before it lands just update the latest deltas.
 * - IPC is backpressured: one setSize/setPosition round-trip in flight at a
 *   time, always applying the freshest deltas, so no queue backlog lag.
 */
function beginWindowResize(event: React.PointerEvent, dir: ResizeDirection) {
  if (!isTauriRuntime || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const grip = event.currentTarget as HTMLElement;
  const pointerId = event.pointerId;
  const startX = event.screenX;
  const startY = event.screenY;
  const movesX = dir.includes("West");
  const movesY = dir.includes("North");

  let lastDx = 0;
  let lastDy = 0;
  let frame: WindowFrame | null = null;
  let geometry: {
    LogicalSize: typeof import("@tauri-apps/api/window").LogicalSize;
    LogicalPosition: typeof import("@tauri-apps/api/window").LogicalPosition;
  } | null = null;
  let inflight = false;
  let dirty = false;
  let ended = false;

  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor =
    dir === "East" || dir === "West"
      ? "ew-resize"
      : dir === "North" || dir === "South"
        ? "ns-resize"
        : dir === "NorthWest" || dir === "SouthEast"
          ? "nwse-resize"
          : "nesw-resize";
  document.body.style.userSelect = "none";

  async function flush() {
    if (!frame || !geometry) return;
    if (inflight) {
      dirty = true;
      return;
    }
    inflight = true;
    try {
      do {
        dirty = false;
        let nextW = frame.width;
        let nextH = frame.height;
        let nextX = frame.x;
        let nextY = frame.y;
        if (dir.includes("East")) nextW = Math.max(frame.width + lastDx, WINDOW_MIN_WIDTH);
        if (dir.includes("West")) {
          nextW = Math.max(frame.width - lastDx, WINDOW_MIN_WIDTH);
          nextX = frame.x + frame.width - nextW;
        }
        if (dir.includes("South")) nextH = Math.max(frame.height + lastDy, WINDOW_MIN_HEIGHT);
        if (dir.includes("North")) {
          nextH = Math.max(frame.height - lastDy, WINDOW_MIN_HEIGHT);
          nextY = frame.y + frame.height - nextH;
        }
        const ops: Promise<void>[] = [
          frame.appWindow.setSize(new geometry.LogicalSize(Math.round(nextW), Math.round(nextH))),
        ];
        if (movesX || movesY) {
          ops.push(
            frame.appWindow.setPosition(new geometry.LogicalPosition(Math.round(nextX), Math.round(nextY))),
          );
        }
        await Promise.all(ops);
      } while (dirty && !ended);
    } catch (err) {
      ended = true;
      toastError("Resize failed", err);
    } finally {
      inflight = false;
    }
  }

  const onMove = (e: PointerEvent) => {
    if (ended) return;
    lastDx = e.screenX - startX;
    lastDy = e.screenY - startY;
    void flush();
  };

  const end = () => {
    if (ended) return;
    ended = true;
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    try {
      grip.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
    grip.removeEventListener("pointermove", onMove);
    grip.removeEventListener("pointerup", end);
    grip.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);
  };

  try {
    grip.setPointerCapture(pointerId);
  } catch {
    /* capture unsupported — document listeners below still catch most cases */
  }
  grip.addEventListener("pointermove", onMove);
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);

  // Frame read runs in parallel with the first pointer moves.
  void (async () => {
    try {
      const windowApi = await import("@tauri-apps/api/window");
      const readFrame = await readWindowFrame();
      if (ended) return;
      geometry = { LogicalSize: windowApi.LogicalSize, LogicalPosition: windowApi.LogicalPosition };
      frame = readFrame;
      void flush();
    } catch (err) {
      end();
      toastError("Resize failed", err);
    }
  })();
}

/**
 * Frameless windows have no native resize borders — these invisible edge and
 * corner strips drive the manual resize.
 */
export function WindowResizeHandles() {
  if (!isTauriRuntime) return null;
  return (
    <>
      {RESIZE_ZONES.map((zone) => (
        <div
          key={zone.dir}
          role="presentation"
          className={cn("fixed", zone.dir.length > 5 ? "z-[210]" : "z-[200]", zone.className)}
          // 1% alpha keeps the strip hit-testable over fully transparent
          // window regions without being visible.
          style={{ cursor: zone.cursor, background: "rgba(0,0,0,0.01)" }}
          onPointerDown={(event) => void beginWindowResize(event, zone.dir)}
        />
      ))}
    </>
  );
}

/**
 * Because the panes float on a transparent window, their edges read as the
 * window boundary — so every pane edge doubles as a window-resize grip.
 * Vertical edges map to the nearest window side.
 */
export function PaneResizeEdges({
  west = false,
  east = false,
  hideLeft = false,
}: {
  west?: boolean;
  east?: boolean;
  /** Skip the left strip when the pane has its own internal resize handle there. */
  hideLeft?: boolean;
}) {
  if (!isTauriRuntime) return null;
  const strip = "absolute z-40";
  const paint = { background: "rgba(0,0,0,0.01)" };
  return (
    <>
      <div
        role="presentation"
        className={cn(strip, "left-2 right-2 top-0 h-[5px]")}
        style={{ ...paint, cursor: "ns-resize" }}
        onPointerDown={(event) => void beginWindowResize(event, "North")}
      />
      <div
        role="presentation"
        className={cn(strip, "bottom-0 left-2 right-2 h-[5px]")}
        style={{ ...paint, cursor: "ns-resize" }}
        onPointerDown={(event) => void beginWindowResize(event, "South")}
      />
      {!hideLeft ? (
        <div
          role="presentation"
          className={cn(strip, "bottom-2 left-0 top-2 w-[5px]")}
          style={{ ...paint, cursor: "ew-resize" }}
          onPointerDown={(event) => void beginWindowResize(event, west ? "West" : "East")}
        />
      ) : null}
      <div
        role="presentation"
        className={cn(strip, "bottom-2 right-0 top-2 w-[5px]")}
        style={{ ...paint, cursor: "ew-resize" }}
        onPointerDown={(event) => void beginWindowResize(event, east ? "East" : "West")}
      />
    </>
  );
}

/**
 * Custom macOS traffic lights for the frameless window. Red hides the window
 * (Rust CloseRequested handler enforces the same for any native close path;
 * ⌘Q quits), yellow minimizes, green zooms. Rendered in the main pane's
 * chrome strip, sogo-style.
 */
export function TrafficLights({ className }: { className?: string }) {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onFocusChanged(({ payload }) => setFocused(payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  if (!isTauriRuntime) return null;

  const act = (action: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) => () => {
    void action(getCurrentWindow()).catch((err) => toastError("Window action failed", err));
  };

  const lightClass = (color: string) =>
    cn(
      "flex h-3 w-3 items-center justify-center rounded-full",
      "shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)] transition-colors duration-200",
      focused ? color : "bg-[var(--overlay-1)]/40 text-transparent",
    );

  return (
    <div className={cn("group/lights flex shrink-0 items-center gap-2", className)}>
      <button
        type="button"
        aria-label="Hide window"
        title="Hide (⌘Q quits)"
        onClick={act((w) => w.hide())}
        onMouseDown={(event) => event.stopPropagation()}
        className={lightClass("bg-[#ff5f57] text-[#4d0000]")}
      >
        <svg viewBox="0 0 8 8" width="6" height="6" className="opacity-0 transition-opacity group-hover/lights:opacity-100">
          <path d="M1.5 1.5 L6.5 6.5 M6.5 1.5 L1.5 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Minimize window"
        title="Minimize"
        onClick={act((w) => w.minimize())}
        onMouseDown={(event) => event.stopPropagation()}
        className={lightClass("bg-[#febc2e] text-[#5a3300]")}
      >
        <svg viewBox="0 0 8 8" width="6" height="6" className="opacity-0 transition-opacity group-hover/lights:opacity-100">
          <path d="M1.4 4 L6.6 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Zoom window"
        title="Zoom"
        onClick={act((w) => w.toggleMaximize())}
        onMouseDown={(event) => event.stopPropagation()}
        className={lightClass("bg-[#28c840] text-[#003800]")}
      >
        <svg viewBox="0 0 8 8" width="6" height="6" className="opacity-0 transition-opacity group-hover/lights:opacity-100">
          <path d="M2.2 2.2 L5.8 2.2 L5.8 5.8 Z M5.8 5.8 L2.2 5.8 L2.2 2.2 Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
