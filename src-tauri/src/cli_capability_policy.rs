//! IntelliZen-only capability choices. Provider configuration files are never written.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Selection {
    pub provider: String,
    pub kind: String,
    pub name: String,
    pub enabled: bool,
}
static WRITE: Mutex<()> = Mutex::new(());

pub fn supported(provider: &str, kind: &str) -> bool {
    matches!(
        (provider, kind),
        ("codex", "plugin" | "connection" | "skill") | ("claude-code", "plugin" | "connection")
    )
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "App data directory unavailable")?
        .join("cli-capabilities.json"))
}
pub fn load(app: &AppHandle) -> Result<Vec<Selection>, String> {
    read(&path(app)?)
}
pub fn for_app(app: &AppHandle, provider: &str) -> Result<Restrictions, String> {
    restrictions(
        provider,
        &crate::acp_paths::home_dir().ok_or("Home directory unavailable")?,
        &load(app)?,
    )
}
fn read(path: &Path) -> Result<Vec<Selection>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Could not read saved capability selections".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err("Could not read saved capability selections".into()),
    }
}
fn save(path: &Path, selections: &[Selection]) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("App data directory unavailable")?)
        .map_err(|_| "Could not create capability settings directory")?;
    let pending = path.with_extension("pending");
    fs::write(
        &pending,
        serde_json::to_vec(selections).map_err(|_| "Could not encode capability selections")?,
    )
    .map_err(|_| "Could not save capability selections")?;
    fs::rename(pending, path).map_err(|_| "Could not save capability selections".into())
}
#[tauri::command]
pub fn cli_capability_set(app: AppHandle, selection: Selection) -> Result<(), String> {
    if !supported(&selection.provider, &selection.kind) {
        return Err(
            "This adapter has no verified session-specific switch for this capability".into(),
        );
    }
    let home = crate::acp_paths::home_dir().ok_or("Home directory unavailable")?;
    let inventory = crate::cli_capabilities::scan(&home);
    if !inventory.items.iter().any(|row| {
        row.provider == selection.provider
            && row.kind == selection.kind
            && row.name == selection.name
    }) {
        return Err("Capability no longer appears in the local inventory; refresh first".into());
    }
    let _guard = WRITE
        .lock()
        .map_err(|_| "Capability settings lock unavailable")?;
    let path = path(&app)?;
    let mut selections = read(&path)?;
    selections.retain(|row| {
        (row.provider.as_str(), row.kind.as_str(), row.name.as_str())
            != (
                selection.provider.as_str(),
                selection.kind.as_str(),
                selection.name.as_str(),
            )
    });
    selections.push(selection);
    save(&path, &selections)
}

#[derive(Default)]
pub struct Restrictions {
    pub args: Vec<String>,
    claude_options: Value,
    disabled_mcp: Vec<String>,
}
impl Restrictions {
    pub fn apply(&self, params: &mut Value) {
        if let Some(servers) = params.get_mut("mcpServers").and_then(Value::as_array_mut) {
            servers.retain(|server| {
                !self
                    .disabled_mcp
                    .iter()
                    .any(|name| server.get("name").and_then(Value::as_str) == Some(name))
            });
        }
        if let Some(options) = self.claude_options.as_object() {
            if !params["_meta"]["claudeCode"].is_object() {
                params["_meta"]["claudeCode"] = json!({});
            }
            if !params["_meta"]["claudeCode"]["options"].is_object() {
                params["_meta"]["claudeCode"]["options"] = json!({});
            }
            for (key, value) in options {
                params["_meta"]["claudeCode"]["options"][key] = value.clone();
            }
        }
    }
}

pub fn restrictions(
    provider: &str,
    home: &Path,
    selections: &[Selection],
) -> Result<Restrictions, String> {
    let selections: Vec<_> = selections
        .iter()
        .filter(|row| row.provider == provider)
        .collect();
    let mut result = Restrictions::default();
    if selections.is_empty() {
        return Ok(result);
    }
    if selections.iter().any(|row| !supported(provider, &row.kind)) {
        return Err("Saved capability restriction is not supported by this adapter".into());
    }
    result.disabled_mcp = selections
        .iter()
        .filter(|row| row.kind == "connection" && !row.enabled)
        .map(|row| row.name.clone())
        .collect();
    if provider == "codex" {
        // Codex splits override keys on dots literally. Put provider names in the
        // TOML value, so dotted/quoted names remain exact and only booleans travel in argv.
        for (section, kind) in [("plugins", "plugin"), ("mcp_servers", "connection")] {
            let entries = toml::Table::from_iter(
                selections.iter().filter(|row| row.kind == kind).map(|row| {
                    (
                        row.name.clone(),
                        toml::Value::Table(toml::Table::from_iter([(
                            "enabled".into(),
                            toml::Value::Boolean(row.enabled),
                        )])),
                    )
                }),
            );
            if !entries.is_empty() {
                result.args.extend([
                    "-c".into(),
                    format!("{section}={}", toml::Value::Table(entries)),
                ]);
            }
        }
        let skills: Vec<_> = selections
            .iter()
            .filter(|row| row.kind == "skill")
            .collect();
        if !skills.is_empty() {
            let text = match fs::read_to_string(home.join(".codex/config.toml")) {
                Ok(text) => text,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
                Err(_) => return Err("Could not read Codex skill configuration".into()),
            };
            let config = text
                .parse::<toml::Table>()
                .map_err(|_| "Could not parse Codex skill configuration")?;
            let mut entries = config
                .get("skills")
                .and_then(|value| value.get("config"))
                .and_then(toml::Value::as_array)
                .cloned()
                .unwrap_or_default();
            for row in skills {
                // Inventory names are path segments, never caller-supplied filesystem paths.
                if row.name.contains(['/', '\\']) || row.name == ".." {
                    return Err("Invalid skill selection".into());
                }
                let path = home.join(".codex/skills").join(&row.name).join("SKILL.md");
                let path = path
                    .canonicalize()
                    .map_err(|_| "Selected skill is no longer available; refresh capabilities")?
                    .to_string_lossy()
                    .into_owned();
                entries
                    .retain(|entry| entry.get("path").and_then(toml::Value::as_str) != Some(&path));
                entries.push(toml::Value::Table(toml::Table::from_iter([
                    ("path".into(), toml::Value::String(path)),
                    ("enabled".into(), toml::Value::Boolean(row.enabled)),
                ])));
            }
            result.args.extend([
                "-c".into(),
                format!("skills.config={}", toml::Value::Array(entries)),
            ]);
        }
    } else if provider == "claude-code" {
        let mut options = json!({});
        for row in selections.iter().filter(|row| row.kind == "plugin") {
            if options.get("settings").is_none() {
                options["settings"] = json!({"enabledPlugins": {}});
            }
            options["settings"]["enabledPlugins"][&row.name] = json!(row.enabled);
        }
        if !result.disabled_mcp.is_empty() {
            // Blocks tool access without changing or disconnecting the CLI-owned server.
            options["disallowedTools"] = json!(result
                .disabled_mcp
                .iter()
                .map(|name| format!("mcp__{name}__*"))
                .collect::<Vec<_>>());
        }
        result.claude_options = options;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn selection(provider: &str, kind: &str, name: &str, enabled: bool) -> Selection {
        Selection {
            provider: provider.into(),
            kind: kind.into(),
            name: name.into(),
            enabled,
        }
    }
    #[test]
    fn codex_overrides_are_provider_scoped_and_quote_dotted_names() {
        let result = restrictions(
            "codex",
            Path::new("/unused"),
            &[
                selection("codex", "plugin", "plugin@market", false),
                selection("codex", "connection", "some.server", false),
                selection("claude-code", "plugin", "other", false),
            ],
        )
        .unwrap();
        assert_eq!(result.args.len(), 4);
        let plugins = result.args[1].parse::<toml::Table>().unwrap();
        let servers = result.args[3].parse::<toml::Table>().unwrap();
        assert_eq!(
            plugins["plugins"]["plugin@market"]["enabled"].as_bool(),
            Some(false)
        );
        assert_eq!(
            servers["mcp_servers"]["some.server"]["enabled"].as_bool(),
            Some(false)
        );
        assert!(!result.args.join(" ").contains("other"));
    }
    #[test]
    fn claude_restrictions_preserve_model_and_remove_disabled_injected_mcp() {
        let result = restrictions(
            "claude-code",
            Path::new("/unused"),
            &[
                selection("claude-code", "plugin", "plugin@market", false),
                selection("claude-code", "connection", "intelizen", false),
            ],
        )
        .unwrap();
        let mut params = json!({"_meta":{"claudeCode":{"options":{"model":"chosen"}},"additionalRoots":["/work"]},"mcpServers":[{"name":"intelizen"},{"name":"keep"}]});
        result.apply(&mut params);
        assert_eq!(params["_meta"]["claudeCode"]["options"]["model"], "chosen");
        assert_eq!(params["_meta"]["additionalRoots"], json!(["/work"]));
        assert_eq!(params["mcpServers"], json!([{"name":"keep"}]));
        assert_eq!(
            params["_meta"]["claudeCode"]["options"]["settings"]["enabledPlugins"]["plugin@market"],
            false
        );
        assert_eq!(
            params["_meta"]["claudeCode"]["options"]["disallowedTools"],
            json!(["mcp__intelizen__*"])
        );
    }
    #[test]
    fn empty_selections_do_not_change_provider_defaults() {
        let result = restrictions("codex", Path::new("/unused"), &[]).unwrap();
        assert!(result.args.is_empty());
        let mut params = json!({"mcpServers":[{"name":"intelizen"}],"_meta":{}});
        let before = params.clone();
        result.apply(&mut params);
        assert_eq!(params, before);
    }
    #[test]
    fn unsupported_switches_fail_instead_of_silently_ignoring_them() {
        assert!(restrictions(
            "qwen",
            Path::new("/unused"),
            &[selection("qwen", "skill", "test", false)]
        )
        .is_err());
        assert!(!supported("claude-code", "skill"));
    }
    #[test]
    fn skill_overrides_preserve_other_configuration_without_writing_cli_files() {
        let root =
            std::env::temp_dir().join(format!("intellizen-skill-policy-{}", std::process::id()));
        let skill = root.join(".codex/skills/review/SKILL.md");
        fs::create_dir_all(skill.parent().unwrap()).unwrap();
        fs::write(&skill, "# Review").unwrap();
        let config_path = root.join(".codex/config.toml");
        let original = "[skills]\nconfig = [{ name = 'other', enabled = false }]\n";
        fs::write(&config_path, original).unwrap();
        let result = restrictions(
            "codex",
            &root,
            &[selection("codex", "skill", "review", false)],
        )
        .unwrap();
        let parsed = result.args[1].parse::<toml::Table>().unwrap();
        let entries = parsed["skills"]["config"].as_array().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["name"].as_str(), Some("other"));
        assert_eq!(entries[1]["enabled"].as_bool(), Some(false));
        assert_eq!(fs::read_to_string(config_path).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn persistence_roundtrip_and_corrupt_file_do_not_reset_choices() {
        let root = std::env::temp_dir().join(format!(
            "intellizen-capability-policy-{}",
            std::process::id()
        ));
        let path = root.join("choices.json");
        save(&path, &[selection("codex", "plugin", "test", false)]).unwrap();
        assert!(!read(&path).unwrap()[0].enabled);
        fs::write(&path, "broken").unwrap();
        assert!(read(&path).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
