// Direct controls contributed by plugins. Hidden until a plugin contributes
// one, so the panel is unchanged without plugins.
import { useInRouterContext, useNavigate } from "react-router-dom";

import { toastError } from "@/lib/toast";

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
  if (actions.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 px-0.5 pb-1" aria-label="Plugin actions">
      {actions.map((action) => (
        <button
          key={`${action.pluginId}:${action.id}`}
          type="button"
          title={`${action.label} · ${action.pluginName}`}
          onClick={() => {
            Promise.resolve()
              .then(() => action.run({ profile, send, navigate }))
              .catch((error) => toastError(`Plugin “${action.pluginName}” action failed`, error));
          }}
          className="rounded-full border border-[var(--border)] bg-[var(--surface-wash)] px-2.5 py-1 font-ui text-[11px] text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
