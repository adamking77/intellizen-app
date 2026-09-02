// `/plugin/:id/*` — the one route App.tsx mounts for every plugin page.
import { useParams } from "react-router-dom";

import { PluginErrorBox, PluginSlot } from "./boundary";
import { usePlugins } from "./registry";
import "./boot";

export function PluginRouteView() {
  const { id = "", "*": splat = "" } = useParams();
  const plugin = usePlugins().find((p) => p.id === id);
  const sub = splat.replace(/^\/+|\/+$/g, "");
  const route = plugin?.contributions.routes.find((r) => (r.path ?? "").replace(/^\/+|\/+$/g, "") === sub);

  if (!plugin) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 font-ui text-[13px] text-[var(--overlay-1)]">
          No plugin named “{id}” is loaded.
        </p>
      </div>
    );
  }
  if (plugin.status === "error") {
    return (
      <div className="p-6">
        <PluginErrorBox name={plugin.name} error={plugin.error ?? "unknown error"} />
      </div>
    );
  }
  if (!route) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 font-ui text-[13px] text-[var(--overlay-1)]">
          “{plugin.name}” has no page at /{sub}.
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-4 sm:px-6">
        <span className="text-label">{route.title ?? plugin.name}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PluginSlot name={plugin.name} render={route.render} resetKey={plugin.loadedAt} />
      </div>
    </div>
  );
}
