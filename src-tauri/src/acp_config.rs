//! Registry-backed ACP session configuration and adapter option parsing.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::acp_paths::expand_tilde;

const REGISTRY_FILE: &str = "acp-agents.json";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentSpawn {
    pub id: String,
    pub engine: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub identity: Option<String>,
    #[serde(default)]
    pub context: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAvailableModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAdapterOptions {
    pub available_models: Vec<AcpAvailableModel>,
    pub current_model: Option<String>,
    pub permission_mode: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpStarted {
    pub agent_id: String,
    pub session_id: String,
    pub pid: Option<u32>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpStatus {
    pub agent_id: String,
    pub session_id: String,
    pub pid: Option<u32>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpCommandProbe {
    pub command: String,
    pub available: bool,
    pub path: Option<String>,
}

pub fn session_key(agent_id: &str, caller: &str, cwd: &Path) -> String {
    serde_json::to_string(&(agent_id, caller, cwd.to_string_lossy())).unwrap_or_default()
}

pub fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join(REGISTRY_FILE))
}

fn read_registry(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_array)
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

pub fn registry_entry(path: &Path, agent_id: &str) -> Result<AcpAgentSpawn, String> {
    read_registry(path)
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry.get("id").and_then(Value::as_str) == Some(agent_id))
        .find_map(|entry| serde_json::from_value::<AcpAgentSpawn>(entry.clone()).ok())
        .ok_or_else(|| format!("no ACP agent {agent_id} in {}", path.display()))
}

pub fn registry_entry_for_engine(path: &Path, engine: &str, agent_id: Option<&str>) -> Result<AcpAgentSpawn, String> {
    let entries = read_registry(path);
    let rows = entries.as_array().into_iter().flatten();
    rows.clone()
        .filter(|entry| agent_id.is_some_and(|id| entry.get("id").and_then(Value::as_str) == Some(id)))
        .chain(rows.filter(|entry| entry.get("engine").and_then(Value::as_str) == Some(engine)))
        .find_map(|entry| serde_json::from_value::<AcpAgentSpawn>(entry.clone()).ok())
        .ok_or_else(|| format!("no configured {engine} ACP agent in {}", path.display()))
}

pub fn adapter_options(session: &Value) -> (AcpAdapterOptions, Option<String>) {
    let mut available_models = Vec::new();
    let mut current_model = session
        .pointer("/models/currentModelId")
        .or_else(|| session.get("currentModelId"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut permission_mode = session
        .pointer("/modes/currentModeId")
        .or_else(|| session.get("permissionMode"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut model_config_id = None;

    if let Some(models) = session
        .pointer("/models/availableModels")
        .or_else(|| session.get("availableModels"))
        .and_then(Value::as_array)
    {
        available_models.extend(models.iter().filter_map(|model| {
            let id = model
                .get("modelId")
                .or_else(|| model.get("id"))
                .and_then(Value::as_str)?;
            Some(AcpAvailableModel {
                id: id.to_string(),
                name: model.get("name").and_then(Value::as_str).unwrap_or(id).to_string(),
                description: model.get("description").and_then(Value::as_str).map(str::to_string),
            })
        }));
    }

    if let Some(options) = session.get("configOptions").and_then(Value::as_array) {
        for option in options {
            let category = option.get("category").and_then(Value::as_str);
            let id = option.get("id").and_then(Value::as_str);
            if category == Some("model") || id == Some("model") {
                model_config_id = id.map(str::to_string);
                current_model = option.get("currentValue").and_then(Value::as_str).map(str::to_string);
                if let Some(models) = option.get("options").and_then(Value::as_array) {
                    available_models = models
                        .iter()
                        .filter_map(|model| {
                            let id = model.get("value").and_then(Value::as_str)?;
                            Some(AcpAvailableModel {
                                id: id.to_string(),
                                name: model.get("name").and_then(Value::as_str).unwrap_or(id).to_string(),
                                description: model.get("description").and_then(Value::as_str).map(str::to_string),
                            })
                        })
                        .collect();
                }
            } else if category == Some("mode") || id == Some("mode") {
                permission_mode = option.get("currentValue").and_then(Value::as_str).map(str::to_string);
            }
        }
    }

    (
        AcpAdapterOptions {
            available_models,
            current_model,
            permission_mode,
        },
        model_config_id,
    )
}

fn context_paths(context: &[String]) -> Vec<String> {
    context
        .iter()
        .map(|path| expand_tilde(path).to_string_lossy().to_string())
        .collect()
}

fn intellizen_mcp_server(engine: &str) -> Vec<Value> {
    if engine != "claude-code" && engine != "codex" {
        return Vec::new();
    }
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../mcp-server/dist/index.js")
        .to_string_lossy()
        .to_string();
    vec![json!({ "name": "intelizen", "command": "node", "args": [script], "env": [] })]
}

pub fn session_params(agent: &AcpAgentSpawn, cwd: &Path) -> Value {
    let context = context_paths(&agent.context);
    let mut meta = json!({ "additionalRoots": context });
    if let Some(identity) = agent.identity.as_deref().filter(|value| !value.trim().is_empty()) {
        meta["systemPrompt"] = json!({ "type": "preset", "preset": "claude_code", "append": identity });
    }
    if let Some(model) = agent.model.as_deref().filter(|value| !value.trim().is_empty()) {
        meta["claudeCode"] = json!({ "options": { "model": model } });
    }
    json!({
        "cwd": cwd.to_string_lossy(),
        "mcpServers": intellizen_mcp_server(&agent.engine),
        "additionalDirectories": context,
        "_meta": meta,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_session_key_separates_places() {
        let panel = session_key("cc", "panel", Path::new("/work/app"));
        assert_ne!(panel, session_key("cc", "room:alpha", Path::new("/work/app")));
        assert_ne!(panel, session_key("cc", "panel", Path::new("/work/other")));
    }

    #[test]
    fn registry_entries_tolerate_absence() {
        let dir = std::env::temp_dir().join(format!("acp-registry-{}", std::process::id()));
        let path = dir.join("nested").join(REGISTRY_FILE);
        assert_eq!(read_registry(&path), json!([]));
        let agents = json!([{ "id": "cc", "engine": "claude-code", "command": "claude-agent-acp" }]);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, serde_json::to_vec_pretty(&agents).unwrap()).unwrap();
        assert_eq!(registry_entry(&path, "cc").unwrap().command, "claude-agent-acp");
        assert!(registry_entry(&path, "nope").is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn session_new_carries_the_saved_agent_configuration() {
        let spec = AcpAgentSpawn {
            id: "configured".into(),
            engine: "claude-code".into(),
            command: "claude-agent-acp".into(),
            args: vec![],
            cwd: None,
            model: Some("sonnet".into()),
            identity: Some("You are the project engineer.".into()),
            context: vec!["~/vault".into()],
        };
        let params = session_params(&spec, Path::new("/tmp/project"));

        assert_eq!(params["cwd"], "/tmp/project");
        assert_eq!(params["_meta"]["claudeCode"]["options"]["model"], "sonnet");
        assert_eq!(params["_meta"]["systemPrompt"]["append"], spec.identity.unwrap());
        assert!(params["additionalDirectories"][0]
            .as_str()
            .is_some_and(|path| path.ends_with("/vault")));
        assert_eq!(params["mcpServers"][0]["name"], "intelizen");
        assert!(params["mcpServers"][0]["args"][0]
            .as_str()
            .is_some_and(|path| path.ends_with("/mcp-server/dist/index.js")));
    }

    #[test]
    fn adapter_options_accept_both_acp_catalog_shapes() {
        let legacy = json!({
            "models": { "currentModelId": "one", "availableModels": [{ "modelId": "one", "name": "One" }] },
            "modes": { "currentModeId": "default", "availableModes": [] }
        });
        let (legacy, legacy_config) = adapter_options(&legacy);
        assert_eq!(legacy.available_models[0].id, "one");
        assert_eq!(legacy.current_model.as_deref(), Some("one"));
        assert_eq!(legacy.permission_mode.as_deref(), Some("default"));
        assert_eq!(legacy_config, None);

        let current = json!({
            "configOptions": [
                { "id": "model", "category": "model", "currentValue": "two", "options": [{ "value": "two", "name": "Two", "description": "Live" }] },
                { "id": "mode", "category": "mode", "currentValue": "acceptEdits" }
            ]
        });
        let (current, model_config) = adapter_options(&current);
        assert_eq!(current.available_models[0].name, "Two");
        assert_eq!(current.current_model.as_deref(), Some("two"));
        assert_eq!(current.permission_mode.as_deref(), Some("acceptEdits"));
        assert_eq!(model_config.as_deref(), Some("model"));
    }
}
