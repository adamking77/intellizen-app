# Window Chrome Layer — Engineering Handoff (2026-07-07)

**Status:** functional, needs polish. Resize UX is the open item.
**Owner:** Claude built it; Codex takes refinement from here.
**Reference implementation:** `~/projects/sogo-work/sogo-app` (App.tsx, lib/windowGeometry.tsx, components/PillBar.tsx). When in doubt, copy sogo.

## Architecture (what exists now)

Frameless transparent macOS window with floating panes, sogo-style.

| Piece | File | Notes |
|---|---|---|
| Window config | `src-tauri/tauri.conf.json` | `decorations: false`, `transparent: true`, `macOSPrivateApi: true`, label `main`, min 900×620 |
| Rust lifecycle | `src-tauri/src/lib.rs` | `CloseRequested` on main → `prevent_close` + hide (mac convention; ⌘Q quits); `RunEvent::Reopen` → show+focus. Agent-panel window close = real close (that's re-dock) |
| Capabilities | `src-tauri/capabilities/default.json` | windows `["main","agent-panel"]`; window create/hide/show/minimize/toggle-maximize/set-focus/set-always-on-top/start-dragging/set-size/set-position/inner-size/outer-position/scale-factor granted |
| Chrome components | `src/components/layout/window-chrome.tsx` | `TrafficLights`, `WindowResizeHandles` (window edges), `PaneResizeEdges` (pane edges), `useWindowDrag`, `isTauriRuntime`, `PANE_BG`/`PANE_BG_RAISED` |
| Shell | `src/components/layout/app-shell.tsx` | Root: transparent + 1%-alpha (hit-testability), gutter drag. Main pane: h-9 chrome strip = TrafficLights + drag + dbl-click zoom. Eject/re-dock logic |
| Sidebar | `sidebar.tsx` | Pane material; collapsed = floating pill (`self-start rounded-[28px]` + shadow); tri-state collapse (user override beats isCramped auto-collapse) |
| Agent panel | `agent-panel.tsx` | Same tri-state collapse; docked pane rounded; left edge = internal width drag (keep!); ejected = frameless always-on-top window with title strip + ↩ re-dock |

## Hard-won platform facts (do not re-learn these)

1. **`startResizeDragging` is a NO-OP on macOS** (tao never implemented it). Any resize must be manual: pointer tracking → `setSize`/`setPosition`. This cost us three iterations.
2. **`data-tauri-drag-region` is unreliable** in this setup. Use sogo's JS pattern: `onMouseDown` → `getCurrentWindow().startDragging()`, guarded by `closest("button, input, a, select, textarea")`.
3. **Fully transparent (alpha-0) regions can lose hit-testing** — resize strips and drag gutters carry `background: rgba(0,0,0,0.01)`.
4. **Every window API call needs an explicit capability** — symptom is a toast like `window.set_size not allowed`.
5. **mouseup gets lost during window mutation** if listeners sit on `document` — the window moves out from under the cursor and release never arrives → resize chases the cursor forever. Fix in place: `setPointerCapture` on the grip element + `pointermove/pointerup/pointercancel` on the element + `window blur` fallback.
6. Vite HMR applies TS/CSS changes to the running app; changes under `src-tauri/` (conf, capabilities, Rust) trigger full rebuild+relaunch by `tauri dev`.

## Current resize implementation (`beginWindowResize` in window-chrome.tsx)

- Synchronous listener attach + pointer capture at pointerdown (no start latency).
- Window frame (innerSize/scaleFactor/outerPosition) read async in parallel; early moves buffer into `lastDx/lastDy`.
- IPC backpressure: one `setSize`(+`setPosition` for West/North) in flight; freshest deltas applied on completion; no rAF, no queue backlog.
- West/North edges move origin: `nextX = startX + startW - nextW` pattern (sogo).
- Min clamps 900×620 (keep in sync with tauri.conf manually).

**Open issue (Adam's report before this rewrite):** start delay + resize continuing after release. The pointer-capture rewrite targets both. If still glitchy after testing, next candidates:
- Coalesce `setSize`+`setPosition` jitter on West/North (two async IPC ops can land out of order → wobble). Option: only `setPosition` after `setSize` resolves, or use physical units and skip rounding drift.
- If smoothness is still unacceptable: switch main window to `titleBarStyle: "Overlay"` + `hiddenTitle` (decorated) → native buttery edge resize + native traffic lights. Cost: native lights are window-positioned (macOS controls them; `trafficLightPosition` config exists), custom lights must be removed, floating-pane transparency still works with `transparent: true`. Pane-edge grips stay manual.

## Grip map (product decision by Adam — pane edges are window-resize grips)

- Main pane: left→West, right→East, top→North, bottom→South
- Sidebar: all edges→West side (top/bottom→North/South)
- Agent panel: right→East, top/bottom→N/S; **left edge reserved for internal panel-width drag**
- True window edges + 4 corners: `WindowResizeHandles` (fixed, z-200/210)

## Also shipped in this layer (working, don't regress)

- Eject: `core:webview:allow-create-webview-window` was missing — that's why it never worked. Now: frameless always-on-top window at `/agent-panel` route, ↩ re-docks, localStorage `intelizen:agent-panel-detached` syncs state across windows, stale-flag recovery on mount.
- Tri-state collapse: below 1100px, panels auto-collapse but user toggle overrides (was: force-collapse made expand buttons dead).
- Solid pane materials (translucent panes bled desktop text through; no backdrop blur available).
- Double-click chrome strip = zoom. Red light = hide (app stays in Dock).

## Test checklist (rerun after any chrome change)

1. Drag: main-pane strip, sidebar header, gutters, ejected-panel strip.
2. Resize: all 4 window edges + corners; all pane-edge grips; fast flicks — no lag-behind, no resize-after-release.
3. Red light hides → Dock click restores. ⌘Q quits. Yellow minimizes, green zooms, dbl-click strip zooms.
4. Eject panel → drag it, resize it, ↩ re-dock; close ejected window directly → re-docks.
5. Sidebar/panel expand+collapse at <1100px width and >1100px.
6. `npx tsc --noEmit` + `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm build` green.
