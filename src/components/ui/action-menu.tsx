import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Control, type ControlProps } from "@/components/ui/control";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  reason?: string;
  danger?: boolean;
}

/** Shared action menu, kept outside clipped or panning content planes. */
export function ActionMenu({ label, actions, children, variant = "quiet", loading = false }: { label: string; actions: MenuAction[]; children?: ReactNode; variant?: ControlProps["variant"]; loading?: boolean }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  function close(restoreFocus = true) { setPosition(null); if (restoreFocus) trigger.current?.focus(); }
  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const rect = menu.current.getBoundingClientRect();
    menu.current.style.top = `${Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8))}px`;
    menu.current.style.left = `${Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8))}px`;
  }, [position, actions.length]);
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const resize = () => setPosition(null);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); };
  }, [position]);
  return <>
    <Control ref={trigger} className="nodrag nopan" size={children ? "sm" : "icon"} variant={variant} loading={loading} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={() => {
      if (position) { close(); return; }
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - actions.length * 34 - 24)) });
    }}>{children ?? <MoreHorizontal aria-hidden className="h-4 w-4" />}</Control>
    {position ? createPortal(<div ref={menu} id={id} role="menu" aria-label={label} style={position} className="fixed z-[100] w-56 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-auto rounded-[var(--r-surface)] bg-[var(--surface)] p-1" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === "Tab") { close(); }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>{actions.map((action, index) => <Control key={index} role="menuitem" variant="quiet" disabled={action.disabled} title={action.reason} className={`h-auto min-h-[var(--h-ctl)] w-full justify-start whitespace-normal break-words py-1 text-left${action.danger ? " text-[var(--danger)]" : ""}`} onClick={() => { close(); action.onSelect(); }}>{action.label}</Control>)}</div>, document.body) : null}
  </>;
}
