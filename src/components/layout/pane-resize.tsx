import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Widths belong to the app layout; internal dividers never resize the OS window. */
export function usePaneResize(key: string, initial: number, min: number, max: number) {
  max = Math.max(min, max);
  const [preferred, setPreferred] = useState(() => {
    try { const saved = Number(localStorage.getItem(key)); return saved >= min ? saved : initial; }
    catch { return initial; }
  });
  const width = Math.max(min, Math.min(preferred, max));
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const commit = (value: number) => {
    setPreferred(value);
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the mounted width. */ }
  };
  const resize = (delta: number) => commit(Math.max(min, Math.min(width + delta, max)));
  const start = (event: ReactPointerEvent<HTMLDivElement>, direction: number) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    event.currentTarget.focus();
    const origin = event.clientX;
    let next = width;
    const move = (pointer: PointerEvent) => {
      next = Math.max(min, Math.min(width + (pointer.clientX - origin) * direction, max));
      setPreferred(next);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    };
    const up = () => { stop(); commit(next); };
    const cancel = () => { stop(); setPreferred(width); };
    cleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  return { width, min, max, resize, start };
}

export type PaneResize = ReturnType<typeof usePaneResize>;

export function PaneDivider({ pane, edge, direction, label }: {
  pane: PaneResize; edge: "left" | "right"; direction: 1 | -1; label: string;
}) {
  return <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label={label}
    aria-valuenow={Math.round(pane.width)} aria-valuemin={pane.min} aria-valuemax={pane.max}
    onPointerDown={event => pane.start(event, direction)}
    onKeyDown={event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault(); event.stopPropagation();
      pane.resize((event.key === "ArrowRight" ? 16 : -16) * direction);
    }}
    className={`absolute inset-y-2 z-50 w-[6px] cursor-col-resize touch-none rounded-[var(--r-ctl)] hover:bg-[var(--line-strong)] focus-visible:bg-[var(--line-strong)] ${edge === "left" ? "left-0" : "right-0"}`}
  />;
}
