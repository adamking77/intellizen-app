//! The ejected agent panel's own window.
//!
//! Ported from hermes-app's window code in its `lib.rs`. The panel leaves the
//! shell as a frameless, transparent, always-on-top webview on the
//! `/agent-panel` route, and comes home by being closed.
//!
//! **Rust owns the window, not the front end.** The previous version built it
//! from JS with `WebviewWindow`, which meant the two webviews had to agree
//! about sizes, the always-on-top flag and the close path by convention. Here
//! one command creates it at the size the shape asks for, one resizes it when
//! the panel reduces to the HUD, and the close event is emitted to the main
//! window so a panel that dies for any reason — re-dock, ⌘W, a crash — brings
//! the conversation home the same way.

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Must match `PANEL_WINDOW` in `src/components/agent/panel-window.ts` and the
/// window list in `capabilities/default.json`.
const LABEL: &str = "agent-panel";
/// Emitted when the panel window is destroyed. `PANEL_CLOSED_EVENT`, same file.
const CLOSED: &str = "agent-panel:closed";

/// How far in from the top-right of the work area the panel first appears.
const MARGIN: f64 = 24.0;

/// The shape the panel is opening in, so the window is created at the size it
/// will render at rather than resizing on its first paint.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelSize {
    pub width: f64,
    pub height: f64,
}

impl PanelSize {
    /// The docked panel's own size, used when the caller names none.
    fn or_default(self) -> Self {
        if self.width >= 200.0 && self.height >= 120.0 {
            self
        } else {
            Self {
                width: 380.0,
                height: 620.0,
            }
        }
    }
}

/// Open the ejected panel, or focus it if it is already open.
///
/// Returns `true` when this call created the window, so the caller can tell a
/// fresh eject from a focus of one already out.
#[tauri::command]
pub async fn panel_open(app: AppHandle, size: Option<PanelSize>) -> Result<bool, String> {
    if let Some(existing) = app.get_webview_window(LABEL) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(false);
    }

    let size = size.unwrap_or_default().or_default();
    let mut builder =
        WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("/agent-panel".into()))
            .title("Agent Panel")
            .inner_size(size.width, size.height)
            .min_inner_size(320.0, 96.0)
            .resizable(true)
            .zoom_hotkeys_enabled(true)
            .decorations(false)
            .transparent(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .shadow(false)
            .always_on_top(true)
            .focused(true)
            .skip_taskbar(false);

    // Top-right of whatever monitor the main window is on, so the panel lands
    // beside the app rather than centred over it.
    if let Some(at) = top_right(&app, size) {
        builder = builder.position(at.x, at.y);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    // A frameless always-on-top window must not paint the platform's ground.
    let _ = window.set_always_on_top(true);

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.emit(CLOSED, ());
            }
        }
    });

    Ok(true)
}

/// Re-dock: close the panel window. Closing is the whole of re-docking, and
/// the destroy event above is what tells the shell to take the panel back.
#[tauri::command]
pub async fn panel_close(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Whether the panel window exists right now. The shell asks on launch and on
/// focus, because a flag in local storage can outlive the window it describes.
#[tauri::command]
pub async fn panel_is_open(app: AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

/// Resize the panel in place — panel to HUD and back. The window keeps its
/// top-left corner unless growing would put its controls off-screen.
#[tauri::command]
pub async fn panel_resize(app: AppHandle, size: PanelSize) -> Result<(), String> {
    let window = app
        .get_webview_window(LABEL)
        .ok_or_else(|| "The agent panel window is not open.".to_string())?;
    let size = size.or_default();
    window
        .set_size(LogicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let scale = monitor.scale_factor();
        let position = window
            .outer_position()
            .map_err(|e| e.to_string())?
            .to_logical::<f64>(scale);
        let origin = monitor.position().to_logical::<f64>(scale);
        let area = monitor.size().to_logical::<f64>(scale);
        let visible = visible_position(position, size, origin, area);
        if visible != position {
            window.set_position(visible).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn visible_position(
    position: LogicalPosition<f64>,
    size: PanelSize,
    origin: LogicalPosition<f64>,
    area: LogicalSize<f64>,
) -> LogicalPosition<f64> {
    LogicalPosition::new(
        position
            .x
            .clamp(origin.x, origin.x + (area.width - size.width).max(0.0)),
        position
            .y
            .clamp(origin.y, origin.y + (area.height - size.height).max(0.0)),
    )
}

/// Where a freshly ejected panel goes: inset from the top-right of the monitor
/// the main window is showing on. `None` when no monitor can be read, in which
/// case Tauri centres the window and nothing is lost.
fn top_right(app: &AppHandle, size: PanelSize) -> Option<LogicalPosition<f64>> {
    let main = app.get_webview_window("main")?;
    let monitor = main.current_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let area = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    Some(LogicalPosition::new(
        origin.x + (area.width - size.width - MARGIN).max(0.0),
        origin.y + MARGIN,
    ))
}

#[cfg(test)]
mod tests {
    use super::{visible_position, PanelSize};
    use tauri::{LogicalPosition, LogicalSize};

    #[test]
    fn growing_near_the_edge_keeps_hud_controls_on_screen() {
        let moved = visible_position(
            LogicalPosition::new(1036.0, 24.0),
            PanelSize {
                width: 468.0,
                height: 126.0,
            },
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1440.0, 900.0),
        );
        assert_eq!(moved, LogicalPosition::new(972.0, 24.0));
    }

    #[test]
    fn resizing_inside_a_secondary_monitor_keeps_the_position() {
        let position = LogicalPosition::new(-1000.0, 100.0);
        assert_eq!(
            visible_position(
                position,
                PanelSize {
                    width: 380.0,
                    height: 620.0
                },
                LogicalPosition::new(-1440.0, 0.0),
                LogicalSize::new(1440.0, 900.0),
            ),
            position
        );
    }

    #[test]
    fn a_missing_or_absurd_size_falls_back_to_the_panel_shape() {
        // The front end always sends one; a stale caller or a bad deserialise
        // must still get a window someone can use.
        assert_eq!(PanelSize::default().or_default().width, 380.0);
        let tiny = PanelSize {
            width: 10.0,
            height: 10.0,
        };
        assert_eq!(tiny.or_default().height, 620.0);
    }

    #[test]
    fn a_real_size_is_kept() {
        let hud = PanelSize {
            width: 468.0,
            height: 126.0,
        };
        assert_eq!(hud.or_default().width, 468.0);
        assert_eq!(hud.or_default().height, 126.0);
    }
}
