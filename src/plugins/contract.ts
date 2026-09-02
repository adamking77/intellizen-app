// The typed API a plugin's `intellizen/plugin.js` receives. Names follow
// Hermes Desktop's plugin SDK (`id`, `name`, `register(ctx)`, `ctx.register`,
// `ctx.onDispose`) so a plugin author moving between the two feels at home.
// The full contract is written up in docs/plugins.md.
import type { ReactNode } from "react";
import * as React from "react";

/** A page at `/plugin/<plugin id>` (or `/plugin/<plugin id>/<path>`). */
export interface PluginRoute {
  /** Sub-path under the plugin's own prefix; omit for the plugin's root page. */
  path?: string;
  title?: string;
  render: () => ReactNode;
}

/** A row in the sidebar's page list, after the built-in pages. */
export interface PluginSidebarEntry {
  label: string;
  /** Where the row goes; defaults to the plugin's root route. */
  to?: string;
  order?: number;
}

/** A widget Adam can add to Home from the Add widget menu. */
export interface PluginWidget {
  id: string;
  label: string;
  description?: string;
  render: () => ReactNode;
}

export interface PluginCommandContext {
  navigate: (to: string) => void;
}

/** A ⌘K palette entry. */
export interface PluginCommand {
  id: string;
  label: string;
  /** Shown right-aligned in mono; defaults to the plugin name. */
  hint?: string;
  run: (ctx: PluginCommandContext) => void;
}

export interface PluginPanelContext extends PluginCommandContext {
  /** The Hermes profile the panel is talking to, if any. */
  profile: string | null;
  /** Send a prompt to that profile as if Adam typed it. */
  send: (text: string) => void;
}

/** An entry in the agent panel's Actions menu. */
export interface PluginPanelAction {
  id: string;
  label: string;
  run: (ctx: PluginPanelContext) => void | Promise<void>;
}

/** One `ctx.register({...})` call. Any subset; call it as often as needed. */
export interface PluginContributions {
  route?: PluginRoute;
  sidebar?: PluginSidebarEntry;
  widget?: PluginWidget;
  command?: PluginCommand;
  panelAction?: PluginPanelAction;
}

export interface PluginContext {
  /** The folder name under `~/.hermes/plugins/`. */
  readonly id: string;
  /** The app's React, so plugin.js needs no imports. `h` is `createElement`. */
  readonly React: typeof React;
  readonly h: typeof React.createElement;
  register: (contributions: PluginContributions) => void;
  /** Runs when the plugin is unloaded or reloaded (timers, subscriptions). */
  onDispose: (fn: () => void) => void;
  /** Absolute app path of this plugin's route, e.g. `/plugin/hello`. */
  routeHref: (path?: string) => string;
}

/** What `intellizen/plugin.js` default-exports. */
export interface IntelliZenPlugin {
  name?: string;
  description?: string;
  register: (ctx: PluginContext) => void;
}

/** Fields read from the plugin's Hermes `plugin.yaml` (top-level scalars only). */
export interface PluginManifest {
  name?: string;
  version?: string;
  description?: string;
}

export const PLUGIN_ROUTE_PREFIX = "/plugin";

export function pluginRouteHref(id: string, path?: string): string {
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return sub ? `${PLUGIN_ROUTE_PREFIX}/${id}/${sub}` : `${PLUGIN_ROUTE_PREFIX}/${id}`;
}
