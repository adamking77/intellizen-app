//! IntelliZen-only capability choices. Provider configuration files are never written.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
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

pub fn for_workflow_read_only(
    app: &AppHandle,
    provider: &str,
    cwd: &Path,
) -> Result<Restrictions, String> {
    workflow_read_only_restrictions(
        provider,
        &crate::acp_paths::home_dir().ok_or("Home directory unavailable")?,
        cwd,
        &load(app)?,
    )
}

pub fn verify_workflow_read_only_adapter(
    spec: &crate::acp_config::AcpAgentSpawn,
) -> Result<(), String> {
    if spec.engine != "codex" || !spec.args.is_empty() {
        return Err(
            "Meanwhile work requires the verified Codex ACP adapter without registry arguments"
                .into(),
        );
    }
    let binary = crate::acp_paths::resolve_binary(&spec.command)
        .ok_or("The configured Codex ACP adapter could not be verified")?;
    if !matches!(
        binary.file_name().and_then(|value| value.to_str()),
        Some("codex-acp" | "codex-acp.js")
    ) {
        return Err("Meanwhile work requires the verified Codex ACP adapter".into());
    }
    let target = binary
        .canonicalize()
        .map_err(|_| "The configured Codex ACP adapter could not be verified")?;
    if !verified_codex_acp_target(&target) {
        return Err("Meanwhile work requires the verified Codex ACP adapter".into());
    }
    Ok(())
}

fn verified_codex_acp_target(target: &Path) -> bool {
    if matches!(
        target.file_name().and_then(|value| value.to_str()),
        Some("codex-acp" | "codex-acp.js")
    ) {
        return true;
    }
    let Some(dist) = target.parent() else {
        return false;
    };
    let Some(package) = dist.parent() else {
        return false;
    };
    if target.file_name().and_then(|value| value.to_str()) != Some("index.js")
        || dist.file_name().and_then(|value| value.to_str()) != Some("dist")
        || package.file_name().and_then(|value| value.to_str()) != Some("codex-acp")
        || package
            .parent()
            .and_then(|path| path.file_name())
            .and_then(|value| value.to_str())
            != Some("@agentclientprotocol")
    {
        return false;
    }
    fs::read_to_string(package.join("package.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|manifest| {
            manifest.get("name").and_then(Value::as_str) == Some("@agentclientprotocol/codex-acp")
                && manifest
                    .get("bin")
                    .and_then(|bin| bin.get("codex-acp"))
                    .and_then(Value::as_str)
                    == Some("dist/index.js")
        })
}

pub fn workflow_read_only_restrictions(
    provider: &str,
    home: &Path,
    cwd: &Path,
    saved: &[Selection],
) -> Result<Restrictions, String> {
    if provider != "codex" {
        return Err(
            "Approval meanwhile work requires a verified Codex ACP read-only binding".into(),
        );
    }
    let mut selections = saved.to_vec();
    let inventory = crate::cli_capabilities::scan(home);
    for item in inventory
        .items
        .into_iter()
        .filter(|item| item.provider == provider && matches!(item.kind, "plugin" | "connection"))
    {
        selections.retain(|row| {
            !(row.provider == provider && row.kind == item.kind && row.name == item.name)
        });
        selections.push(Selection {
            provider: provider.into(),
            kind: item.kind.into(),
            name: item.name,
            enabled: false,
        });
    }
    // Codex loads every trusted .codex/config.toml from the repository root
    // through cwd, above the user config and below argv overrides. Enumerate
    // every ancestor so an enabled project plugin or MCP gets an exact final
    // `enabled=false` override. A malformed or unreadable layer fails closed.
    let mut config_paths = HashSet::new();
    config_paths.insert(home.join(".codex/config.toml"));
    for ancestor in cwd.ancestors() {
        config_paths.insert(ancestor.join(".codex/config.toml"));
    }
    for config_path in config_paths {
        for selection in disabled_codex_config_capabilities(&config_path)? {
            selections.retain(|row| {
                !(row.provider == provider
                    && row.kind == selection.kind
                    && row.name == selection.name)
            });
            selections.push(selection);
        }
    }
    // IntelliZen is injected at session/new even when it is absent from the
    // user's CLI config, so it must be disabled explicitly for this process.
    selections.retain(|row| {
        !(row.provider == provider && row.kind == "connection" && row.name == "intelizen")
    });
    selections.push(Selection {
        provider: provider.into(),
        kind: "connection".into(),
        name: "intelizen".into(),
        enabled: false,
    });
    let mut result = restrictions(provider, home, &selections)?;
    result.required_session_mode = Some("read-only");
    result.disable_all_mcp = true;
    result.remove_codex_home = true;
    Ok(result)
}

fn disabled_codex_config_capabilities(path: &Path) -> Result<Vec<Selection>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => {
            return Err("Could not read a Codex config layer for read-only workflow work".into())
        }
    };
    let config = text
        .parse::<toml::Table>()
        .map_err(|_| "Could not verify a Codex config layer for read-only workflow work")?;
    let mut selections = vec![];
    for (section, kind) in [("plugins", "plugin"), ("mcp_servers", "connection")] {
        if let Some(entries) = config.get(section).and_then(toml::Value::as_table) {
            selections.extend(entries.keys().map(|name| Selection {
                provider: "codex".into(),
                kind: kind.into(),
                name: name.clone(),
                enabled: false,
            }));
        }
    }
    Ok(selections)
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
    pub required_session_mode: Option<&'static str>,
    pub remove_codex_home: bool,
    claude_options: Value,
    disabled_mcp: Vec<String>,
    disable_all_mcp: bool,
}
impl Restrictions {
    pub fn apply(&self, params: &mut Value) {
        if let Some(servers) = params.get_mut("mcpServers").and_then(Value::as_array_mut) {
            if self.disable_all_mcp {
                servers.clear();
            } else {
                servers.retain(|server| {
                    !self
                        .disabled_mcp
                        .iter()
                        .any(|name| server.get("name").and_then(Value::as_str) == Some(name))
                });
            }
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
    fn workflow_policy_disables_project_config_and_all_injected_mcp() {
        let root =
            std::env::temp_dir().join(format!("intellizen-workflow-policy-{}", std::process::id()));
        let cwd = root.join("repo/subdir");
        fs::create_dir_all(cwd.join(".codex")).unwrap();
        fs::write(
            cwd.join(".codex/config.toml"),
            "[plugins.\"project-writer\"]\nenabled=true\n[mcp_servers.project_remote]\ncommand='false'\n",
        )
        .unwrap();
        let result = workflow_read_only_restrictions("codex", &root, &cwd, &[]).unwrap();
        let args = result.args.join(" ");
        assert!(args.contains("project-writer"));
        assert!(args.contains("project_remote"));
        let mut params = json!({"mcpServers":[{"name":"unknown-injected"}],"_meta":{}});
        result.apply(&mut params);
        assert_eq!(params["mcpServers"], json!([]));
        fs::remove_dir_all(root).unwrap();
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
