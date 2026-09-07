use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static APP_LAUNCH_ID: OnceLock<String> = OnceLock::new();

#[tauri::command]
pub fn app_launch_id() -> String {
    APP_LAUNCH_ID
        .get_or_init(|| {
            let started = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            format!("{}-{started}", std::process::id())
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::app_launch_id;

    #[test]
    fn launch_identity_is_stable_for_the_native_process() {
        let first = app_launch_id();
        assert_eq!(first, app_launch_id());
        assert!(first.starts_with(&format!("{}-", std::process::id())));
    }
}
