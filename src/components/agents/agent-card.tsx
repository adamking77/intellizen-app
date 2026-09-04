// One card in the grid, after the donor: the card opens the editor; the
// hover menu holds everything else.

import { MoreHorizontal, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

const CARD =
  "flex w-full flex-col gap-[13px] rounded-[var(--r-plane)] bg-[var(--mantle)] p-4 text-left text-[var(--text)] " +
  "transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,var(--mantle))]";

export function Tag({ children, tone, className }: { children: ReactNode; tone?: "bad" | "wait" | "ok"; className?: string }) {
  const color = tone ? `var(--${tone})` : "var(--subtext-0)";
  return (
    <span
      className={cn("whitespace-nowrap rounded-[var(--r-pill)] px-2 py-px font-ui text-[var(--t-section)] leading-4", className)}
      style={{
        color,
        background: tone ? `color-mix(in srgb, ${color} 14%, transparent)` : "color-mix(in srgb, var(--text) 10%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

export function Card({ label, items, onOpen, children }: { label: string; items: ContextMenuItem[]; onOpen: () => void; children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="group relative flex">
      <button
        type="button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className={cn(
          "absolute right-2.5 top-2.5 z-[2] flex h-5 w-5 items-center justify-center rounded-[var(--r-ctl)] text-[var(--text-muted)] transition-opacity",
          "hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100",
          menu ? "opacity-100" : "opacity-0",
        )}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 2 });
        }}
      >
        <MoreHorizontal size={13} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        className={CARD}
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {children}
      </button>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

export function NewCard({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(CARD, "min-h-[150px] items-center justify-center gap-2 text-[var(--text-muted)] disabled:opacity-50")}
    >
      <Plus size={20} strokeWidth={1.6} aria-hidden />
      <span className="font-ui text-[var(--t-ui)]">{label}</span>
    </button>
  );
}
