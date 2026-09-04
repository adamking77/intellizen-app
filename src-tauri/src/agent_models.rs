//! Model choices for the agent editor.
//!
//! Hermes already owns the authoritative broker catalog in
//! `~/.hermes/provider_models_cache.json`; reading that cache keeps IntelliZen
//! aligned with the models the installed Hermes will actually accept. ACP
//! providers are asked directly; IntelliZen does not keep a second catalog.

use std::{collections::HashSet, fs, path::PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::acp;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    pub id: String,
    /// The Hermes inference provider written beside the model pin. Empty for
    /// a CLI that runs as itself.
    pub provider: String,
    /// Human-readable optgroup label. Custom provider URLs stay out of the UI
    /// while `provider` retains the exact value Hermes needs.
    pub group: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelCatalog {
    pub models: Vec<AgentModel>,
    pub permission_mode: Option<String>,
}

fn hermes_cache_path() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".hermes/provider_models_cache.json"))
}

fn hermes_models() -> Vec<AgentModel> {
    let Some(path) = hermes_cache_path() else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(Value::Object(providers)) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };

    let mut models = Vec::new();
    let mut seen = HashSet::new();
    for (provider, entry) in providers {
        let group = if provider.starts_with("custom:") {
            "custom".to_string()
        } else {
            provider.clone()
        };
        let Some(ids) = entry.get("models").and_then(Value::as_array) else {
            continue;
        };
        for id in ids.iter().filter_map(Value::as_str) {
            if seen.insert((provider.clone(), id.to_string())) {
                models.push(AgentModel {
                    id: id.to_string(),
                    provider: provider.clone(),
                    group: group.clone(),
                    name: id.to_string(),
                    description: None,
                });
            }
        }
    }
    models.sort_by(|a, b| a.group.cmp(&b.group).then(a.id.cmp(&b.id)));
    models
}

#[tauri::command]
pub async fn agent_models(
    app: AppHandle,
    provider: String,
    agent_id: Option<String>,
) -> Result<AgentModelCatalog, String> {
    if provider == "hermes" {
        return Ok(AgentModelCatalog {
            models: hermes_models(),
            permission_mode: None,
        });
    }
    let options = acp::agent_options(&app, &provider, agent_id.as_deref()).await?;
    Ok(AgentModelCatalog {
        models: options
            .available_models
            .into_iter()
            .map(|model| AgentModel {
                id: model.id,
                provider: String::new(),
                group: String::new(),
                name: model.name,
                description: model.description,
            })
            .collect(),
        permission_mode: options.permission_mode,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_models_keep_their_broker() {
        for model in hermes_models() {
            assert!(!model.provider.is_empty());
            assert_eq!(model.name, model.id);
        }
    }
}
