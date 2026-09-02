// The agent panel's Actions menu: one row per plugin panel action. Hidden
// until a plugin contributes one, so the panel is unchanged without plugins.
import { useEffect, useRef, useState } from "react";
import { useInRouterContext, useNavigate } from "react-router-dom";

import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { usePluginPanelActions } from "./registry";
import "./boot";

interface Props {
  profile: string | null;
  send: (text: string) => void;
}

/** The panel mounts inside the router in the app; tests may mount it bare. */
export function PluginPanelActions(props: Props) {
  return useInRouterContext() ? <RoutedActions {...props} /> : <Actions {...props} navigate={(to) => window.location.assign(to)} />;
}

function RoutedActions(props: Props) {
  const navigate = useNavigate();
  return <Actions {...props} navigate={(to) => navigate(to)} />;
}

function Actions({ profile, send, navigate }: Props & { navigate: (to: string) => void }) {
  const actions = usePluginPanelActions();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded-full px-2 py-px font-ui text-[11px] leading-4 text-[var(--text-muted)]",
          "transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
          open && "bg-[var(--selected)] text-[var(--text)]",
        )}
      >
        Actions
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-[240px] rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-1 shadow-[var(--shadow-elevated)]"
        >
          {actions.map((action) => (
            <button
              key={`${action.pluginId}:${action.id}`}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                Promise.resolve()
                  .then(() => action.run({ profile, send, navigate }))
                  .catch((error) => toastError(`Plugin “${action.pluginName}” action failed`, error));
              }}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-ui text-[12px] text-[var(--text)] transition-colors hover:bg-[var(--surface-wash)]"
            >
              <span className="truncate">{action.label}</span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">{action.pluginName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
