// Plugin rows in the sidebar page list, after the built-in pages. A broken
// plugin still gets a row, marked, so its error is one click away.
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

import { pluginRouteHref } from "./contract";
import { usePluginSidebarEntries, usePlugins } from "./registry";
import "./boot";

const LINK_CLASS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";

export function PluginSidebarEntries({ collapsed }: { collapsed: boolean }) {
  const entries = usePluginSidebarEntries();
  const broken = usePlugins().filter((p) => p.status === "error");
  if (entries.length === 0 && broken.length === 0) return null;

  return (
    <>
      {entries.map((entry) => (
        <NavLink
          key={`${entry.pluginId}:${entry.label}`}
          to={entry.to ?? pluginRouteHref(entry.pluginId)}
          title={collapsed ? entry.label : undefined}
          className={cn(collapsed ? "rail-node mx-auto" : "nav-node", LINK_CLASS)}
        >
          {collapsed ? (
            <span aria-hidden className="font-ui text-[var(--t-meta)] font-semibold">
              {entry.label.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span>{entry.label}</span>
          )}
        </NavLink>
      ))}
      {broken.map((plugin) => (
        <NavLink
          key={`broken:${plugin.id}`}
          to={pluginRouteHref(plugin.id)}
          title={`${plugin.name}: ${plugin.error}`}
          aria-label={`${plugin.name} (failed to load)`}
          className={cn(collapsed ? "rail-node mx-auto" : "nav-node", LINK_CLASS)}
        >
          {collapsed ? (
            <span aria-hidden className="font-ui text-[var(--t-meta)] font-semibold text-[var(--danger)]">
              !
            </span>
          ) : (
            <>
              <span className="truncate">{plugin.name}</span>
              <span className="ml-auto font-mono text-[var(--t-count)] text-[var(--danger)]">failed</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}
