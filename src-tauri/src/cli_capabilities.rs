//! Read-only, user-scope CLI inventory. Never return configuration values or run a CLI.
use serde::Serialize;
use serde_json::Value;
use std::{fs, io::ErrorKind, path::Path};

#[derive(Serialize)]
pub struct Capability {
    pub provider: String,
    pub kind: &'static str,
    pub name: String,
    state: &'static str,
    enabled: bool,
    controllable: bool,
    overridden: bool,
}

#[derive(Default, Serialize)]
pub struct Inventory {
    pub items: Vec<Capability>,
    warnings: Vec<String>,
}

impl Inventory {
    fn add(&mut self, provider: &str, kind: &'static str, name: &str, state: &'static str) {
        self.items.push(Capability {
            provider: provider.into(),
            kind,
            name: name.into(),
            state,
            enabled: state != "Disabled in config",
            controllable: crate::cli_capability_policy::supported(provider, kind),
            overridden: false,
        });
    }

    fn read(&mut self, root: &Path, rel: &str) -> Option<String> {
        match fs::read_to_string(root.join(rel)) {
            Ok(text) => Some(text),
            Err(error) => {
                if error.kind() != ErrorKind::NotFound {
                    // Do not serialize parser errors: they may include secret-bearing source lines.
                    self.warnings.push(format!("Could not read {rel}."));
                }
                None
            }
        }
    }

    fn json(&mut self, root: &Path, rel: &str) -> Value {
        let Some(text) = self.read(root, rel) else {
            return Value::Null;
        };
        serde_json::from_str(&text).unwrap_or_else(|_| {
            self.warnings.push(format!("Could not parse {rel}."));
            Value::Null
        })
    }

    fn directory(&mut self, root: &Path, rel: &str, provider: &str, kind: &'static str) {
        let entries = match fs::read_dir(root.join(rel)) {
            Ok(entries) => entries,
            Err(error) => {
                if error.kind() != ErrorKind::NotFound {
                    self.warnings.push(format!("Could not read {rel}."));
                }
                return;
            }
        };
        for entry in entries {
            let Ok(entry) = entry else {
                self.warnings
                    .push(format!("Could not read an entry in {rel}."));
                continue;
            };
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            // is_file follows skill symlinks. Do not recursively walk caches or unrelated directories.
            let found = match kind {
                "skill" => path.join("SKILL.md").is_file(),
                "command" => path.is_file() && path.extension().is_some_and(|ext| ext == "md"),
                "plugin" => {
                    path.join("plugin.yaml").is_file() || path.join("plugin.json").is_file()
                }
                _ => false,
            };
            if found {
                let label = if kind == "command" {
                    name.trim_end_matches(".md")
                } else {
                    &name
                };
                self.add(provider, kind, label, "On disk");
            }
        }
    }

    fn mcp(&mut self, provider: &str, config: &Value) {
        if let Some(servers) = config.get("mcpServers").and_then(Value::as_object) {
            for name in servers.keys() {
                self.add(provider, "connection", name, "Configured");
            }
        }
    }
}

pub fn scan(root: &Path) -> Inventory {
    let mut result = Inventory::default();
    for (provider, dir) in [
        ("hermes", ".hermes"),
        ("claude-code", ".claude"),
        ("codex", ".codex"),
        ("gemini", ".gemini"),
        ("qwen", ".qwen"),
    ] {
        result.directory(root, &format!("{dir}/skills"), provider, "skill");
    }
    result.directory(root, ".claude/commands", "claude-code", "command");
    result.directory(root, ".codex/prompts", "codex", "command");
    result.directory(root, ".hermes/plugins", "hermes", "plugin");

    let claude = result.json(root, ".claude/settings.json");
    let installed = result.json(root, ".claude/plugins/installed_plugins.json");
    if let Some(plugins) = installed.get("plugins").and_then(Value::as_object) {
        for (name, entries) in plugins {
            // An installation registry is authoritative; arbitrary cache folders are not installs.
            if entries.as_array().is_none_or(|entries| entries.is_empty()) {
                continue;
            }
            let state = match claude
                .get("enabledPlugins")
                .and_then(|plugins| plugins.get(name))
                .and_then(Value::as_bool)
            {
                Some(true) => "Enabled in config",
                Some(false) => "Disabled in config",
                None => "Installed",
            };
            result.add("claude-code", "plugin", name, state);
        }
    }
    if let Some(text) = result.read(root, ".codex/config.toml") {
        match text.parse::<toml::Table>() {
            Ok(config) => {
                if let Some(skills) = config
                    .get("skills")
                    .and_then(|v| v.get("config"))
                    .and_then(toml::Value::as_array)
                {
                    for row in result
                        .items
                        .iter_mut()
                        .filter(|row| row.provider == "codex" && row.kind == "skill")
                    {
                        let path = root
                            .join(".codex/skills")
                            .join(&row.name)
                            .join("SKILL.md")
                            .canonicalize()
                            .ok();
                        if let Some(enabled) = skills
                            .iter()
                            .rev()
                            .find(|entry| {
                                entry.get("name").and_then(toml::Value::as_str) == Some(&row.name)
                                    || entry.get("path").and_then(toml::Value::as_str).is_some_and(
                                        |value| {
                                            path.is_some()
                                                && Path::new(value).canonicalize().ok() == path
                                        },
                                    )
                            })
                            .and_then(|entry| entry.get("enabled"))
                            .and_then(toml::Value::as_bool)
                        {
                            row.enabled = enabled;
                            row.state = if enabled {
                                "Enabled in config"
                            } else {
                                "Disabled in config"
                            };
                        }
                    }
                }
                for (section, kind) in [("plugins", "plugin"), ("mcp_servers", "connection")] {
                    if let Some(entries) = config.get(section).and_then(toml::Value::as_table) {
                        for (name, value) in entries {
                            let state = match value.get("enabled").and_then(toml::Value::as_bool) {
                                Some(false) => "Disabled in config",
                                Some(true) => "Enabled in config",
                                None => "Configured",
                            };
                            result.add("codex", kind, name, state);
                        }
                    }
                }
            }
            Err(_) => result
                .warnings
                .push("Could not parse .codex/config.toml.".into()),
        }
    }
    for (provider, rel) in [
        ("claude-code", ".claude.json"),
        ("gemini", ".gemini/settings.json"),
        ("qwen", ".qwen/settings.json"),
    ] {
        let config = result.json(root, rel);
        result.mcp(provider, &config);
    }
    result
        .items
        .sort_by(|a, b| (&a.provider, a.kind, &a.name).cmp(&(&b.provider, b.kind, &b.name)));
    result
}

#[tauri::command]
pub async fn cli_capabilities(app: tauri::AppHandle) -> Result<Inventory, String> {
    let root = crate::acp_paths::home_dir().ok_or("Home directory unavailable")?;
    let selections = crate::cli_capability_policy::load(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut inventory = scan(&root);
        for row in &mut inventory.items {
            if let Some(selection) = selections
                .iter()
                .find(|s| s.provider == row.provider && s.kind == row.kind && s.name == row.name)
            {
                row.enabled = selection.enabled;
                row.overridden = true;
            }
        }
        inventory
    })
    .await
    .map_err(|_| "CLI inventory scan failed".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!(
                "intellizen-capabilities-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            )))
        }
        fn write(&self, rel: &str, text: &str) {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn inventories_registry_not_cache_and_never_returns_secret_values() {
        let f = Fixture::new();
        f.write(".claude/plugins/cache/not-installed/plugin.json", "{}");
        f.write(
            ".claude/plugins/installed_plugins.json",
            r#"{"plugins":{"installed@market":[{"installPath":"private","scope":"user"}]}}"#,
        );
        f.write(
            ".claude/settings.json",
            r#"{"enabledPlugins":{"installed@market":false},"env":{"KEY":"DO_NOT_RETURN"}}"#,
        );
        f.write(".codex/config.toml", "[plugins.\"plugin@market\"]\nenabled = true\n[mcp_servers.\"quoted.name\"]\nsecret = 'DO_NOT_RETURN'\n");
        let result = scan(&f.0);
        assert_eq!(result.items.len(), 3);
        assert!(result
            .items
            .iter()
            .any(|c| c.name == "installed@market" && c.state == "Disabled in config"));
        assert!(result
            .items
            .iter()
            .any(|c| c.name == "quoted.name" && c.kind == "connection"));
        let encoded = serde_json::to_string(&result).unwrap();
        assert!(!encoded.contains("DO_NOT_RETURN"));
        assert!(!encoded.contains("not-installed"));
        assert!(!encoded.contains("private"));
    }

    #[test]
    fn malformed_config_reports_safe_warning_and_keeps_other_providers() {
        let f = Fixture::new();
        f.write(".codex/config.toml", "bad = SECRET_MUST_NOT_ESCAPE");
        f.write(".claude/settings.json", "SECRET_MUST_NOT_ESCAPE");
        f.write(".hermes/plugins/supabase/plugin.yaml", "name: supabase");
        let result = scan(&f.0);
        assert_eq!(result.warnings.len(), 2);
        assert_eq!(result.items[0].name, "supabase");
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("SECRET_MUST_NOT_ESCAPE"));
    }

    #[test]
    fn missing_configuration_is_empty_not_an_error() {
        let result = scan(&Fixture::new().0);
        assert!(result.items.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn skill_symlinks_are_visible_without_walking_cache_directories() {
        let f = Fixture::new();
        f.write("canonical/SKILL.md", "# Skill");
        fs::create_dir_all(f.0.join(".codex/skills")).unwrap();
        std::os::unix::fs::symlink(f.0.join("canonical"), f.0.join(".codex/skills/linked"))
            .unwrap();
        f.write(".codex/prompts/review.md", "# Review");
        let result = scan(&f.0);
        assert_eq!(result.items.len(), 2);
        assert!(result.items.iter().any(|c| c.name == "linked"));
    }
}
