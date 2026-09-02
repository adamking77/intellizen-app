# IntelliZen plugins

A plugin is a folder under `~/.hermes/plugins/<id>/`. It is the same folder
Hermes reads (`plugin.yaml`, optional `dashboard/plugin_api.py`) plus our
entry, `intellizen/plugin.js`. Folders without `intellizen/plugin.js` are
ordinary Hermes plugins and are ignored. The folder name is the plugin id.

```
~/.hermes/plugins/hello/
├── plugin.yaml              # Hermes manifest: name, version, description (read)
├── dashboard/plugin_api.py  # optional Hermes REST at /api/plugins/hello (not ours)
└── intellizen/plugin.js     # our entry, plain ES module, no imports
```

## The entry

`plugin.js` default-exports `{ name?, description?, register(ctx) }`. Nothing
is imported: React arrives on the context.

```js
export default {
  name: "Hello",
  register(ctx) {
    const { h } = ctx;                       // React.createElement
    ctx.register({
      route:       { path?, title?, render: () => h(...) },        // /plugin/hello[/path]
      sidebar:     { label, to?, order? },                          // a row after the built-in pages
      widget:      { id, label, description?, render },             // Home ▸ Add widget
      command:     { id, label, hint?, run({ navigate }) },         // ⌘K
      panelAction: { id, label, run({ profile, send, navigate }) }, // agent panel ▸ Actions
    });
    ctx.onDispose(() => { /* timers, subscriptions */ });
  },
};
```

`ctx` carries `id`, `React`, `h`, `register` (call it as often as you like),
`onDispose`, and `routeHref(path?)` (the absolute path of the plugin's page).
Types: `src/plugins/contract.ts`. Example: `src/fixtures/plugins/hello/`.

## Loading

- Loaded at boot and re-read every 5 s while the window is visible; a changed
  `plugin.js` or `plugin.yaml` hot-reloads that plugin (its `onDispose` runs
  first). A removed folder unloads. ⌘K ▸ "Reload plugins" forces a pass.
- A plugin that throws, at evaluation, in `register`, or while rendering,
  fails alone. Its error shows as a toast, a marked sidebar row, and in place
  of its page or widget. Other plugins and the app are unaffected.
- The entry is evaluated as an ES module from a blob URL in the app's own
  realm with full app authority. This is error isolation, not a sandbox:
  local disk only, per `ROADMAP.md`. The CSP allows `script-src blob:` for it.
- Home widget placement is per Mac (localStorage) until a Home Pins kind
  exists for plugins.

## Hooks for surfaces

`src/plugins/registry.ts`: `usePluginRoutes`, `usePluginSidebarEntries`,
`usePluginWidgets`, `usePluginCommands`, `usePluginPanelActions`,
`usePlugins` (records with status and error). Mounts: `PluginRouteView`
(`/plugin/:id/*`), `PluginSidebarEntries`, `PluginWidgetMenuItems` +
`PluginWidgetBoard`, `usePluginPaletteCommands`, `PluginPanelActions`.
