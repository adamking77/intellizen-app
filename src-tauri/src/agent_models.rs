//! Model choices for the agent editor.
//!
//! Hermes already owns the authoritative broker catalog in
//! `~/.hermes/provider_models_cache.json`; reading that cache keeps IntelliZen
//! aligned with the models the installed Hermes will actually accept. CLI
//! providers expose a small stable picker until their ACP adapter can supply
//! its live config options directly.

use std::{collections::HashSet, fs, path::PathBuf};

use serde::Serialize;
use serde_json::Value;

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
                });
            }
        }
    }
    models.sort_by(|a, b| a.group.cmp(&b.group).then(a.id.cmp(&b.id)));
    models
}

fn own_models(provider: &str) -> &'static [&'static str] {
    match provider {
        "claude-code" => &[
            "default",
            "opus[1m]",
            "claude-fable-5-1[1m]",
            "sonnet",
            "haiku",
        ],
        "codex" => &[
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-5.5",
            "gpt-5.4",
        ],
        "gemini" => &["gemini-2.5-pro", "gemini-2.5-flash"],
        "qwen" => &["qwen3-coder-plus", "qwen3-coder-flash"],
        _ => &[],
    }
}

#[tauri::command]
pub fn agent_models(provider: String) -> Vec<AgentModel> {
    if provider == "hermes" {
        return hermes_models();
    }
    own_models(&provider)
        .iter()
        .map(|id| AgentModel {
            id: (*id).to_string(),
            provider: String::new(),
            group: String::new(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_models_do_not_claim_a_broker() {
        let models = agent_models("codex".to_string());
        assert!(models.iter().any(|model| model.id.starts_with("gpt-5.6")));
        assert!(models.iter().all(|model| model.provider.is_empty()));
    }

    #[test]
    fn unknown_providers_have_no_invented_models() {
        assert!(agent_models("unknown".to_string()).is_empty());
    }
}
