//! Dynamic discovery of installed ACP agents.
//!
//! Launch recipes come from the official ACP registry. Discovery only checks
//! executable paths; it never runs or installs a candidate. A cached registry
//! keeps known recipes available offline, and unregistered `*-acp` binaries
//! remain usable through the local fallback.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::future::join_all;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::acp_paths::{discovery_bin_dirs, is_executable, resolve_binary};

const REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const CACHE_FILE: &str = "acp-registry-cache.json";
const ICON_CACHE_DIR: &str = "acp-provider-icons";
const ICON_CDN_PREFIX: &str = "https://cdn.agentclientprotocol.com/registry/";
const MAX_ICON_BYTES: u64 = 256 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredAcpProvider {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub path: String,
    pub source: String,
}

fn registry_cache(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(CACHE_FILE))
}

fn icon_mime(url: &str) -> Option<(&'static str, &'static str)> {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    if path.ends_with(".svg") {
        Some(("image/svg+xml", "svg"))
    } else if path.ends_with(".png") {
        Some(("image/png", "png"))
    } else if path.ends_with(".webp") {
        Some(("image/webp", "webp"))
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        Some(("image/jpeg", "jpg"))
    } else {
        None
    }
}

fn icon_cache(app: &AppHandle, id: &str, extension: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| {
        dir.join(ICON_CACHE_DIR)
            .join(format!("{}.{}", safe_id(id), extension))
    })
}

fn icon_data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

async fn load_icon(
    app: &AppHandle,
    client: Option<&reqwest::Client>,
    id: &str,
    url: &str,
) -> Option<String> {
    let (mime, extension) = icon_mime(url)?;
    let cache = icon_cache(app, id, extension)?;
    if let Ok(bytes) = fs::read(&cache) {
        if !bytes.is_empty() && bytes.len() as u64 <= MAX_ICON_BYTES {
            return Some(icon_data_url(mime, &bytes));
        }
    }
    if !url.starts_with(ICON_CDN_PREFIX) {
        return None;
    }
    let response = client?.get(url).send().await.ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > MAX_ICON_BYTES)
    {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_ICON_BYTES {
        return None;
    }
    if let Some(parent) = cache.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(cache, &bytes);
    Some(icon_data_url(mime, &bytes))
}

async fn hydrate_icons(app: &AppHandle, providers: &mut [DiscoveredAcpProvider]) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .ok();
    let loads = providers
        .iter()
        .enumerate()
        .filter_map(|(index, provider)| {
            let url = provider.icon.clone()?;
            let id = provider.id.clone();
            let app = app.clone();
            let client = client.clone();
            Some(async move { (index, load_icon(&app, client.as_ref(), &id, &url).await) })
        })
        .collect::<Vec<_>>();
    for (index, icon) in join_all(loads).await {
        providers[index].icon = icon;
    }
}

async fn registry(app: &AppHandle) -> Option<Value> {
    let fetched = if let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        match client.get(REGISTRY_URL).send().await {
            Ok(response) if response.status().is_success() => {
                response.text().await.ok().and_then(|text| {
                    serde_json::from_str::<Value>(&text)
                        .ok()
                        .map(|value| (text, value))
                })
            }
            _ => None,
        }
    } else {
        None
    };

    if let Some((text, value)) = fetched {
        if let Some(path) = registry_cache(app) {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, text);
        }
        return Some(value);
    }

    registry_cache(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}

fn executable_name(command: &str) -> Option<String> {
    Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.trim_end_matches(".exe")
                .trim_end_matches(".cmd")
                .to_string()
        })
}

fn safe_id(value: &str) -> String {
    let mut id = String::new();
    let mut dash = false;
    for character in value.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            id.push(character);
            dash = false;
        } else if !dash && !id.is_empty() {
            id.push('-');
            dash = true;
        }
    }
    id.trim_matches('-').to_string()
}

fn canonical_id(value: &str) -> String {
    match value {
        "claude-acp" | "claude-agent-acp" => "claude-code".to_string(),
        "codex-acp" => "codex".to_string(),
        "qwen-code" => "qwen".to_string(),
        _ => safe_id(value),
    }
}

fn title(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            if part.eq_ignore_ascii_case("acp") {
                return "ACP".to_string();
            }
            let mut characters = part.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn package_name(value: &str) -> String {
    let tail = value.rsplit('/').next().unwrap_or(value);
    tail.rsplit_once('@')
        .map(|(name, _)| name)
        .filter(|name| !name.is_empty())
        .unwrap_or(tail)
        .to_string()
}

fn candidate_names(id: &str, name: &str, package: Option<&str>) -> Vec<String> {
    let mut names = Vec::new();
    for raw in [Some(id), package, Some(&safe_id(name))]
        .into_iter()
        .flatten()
    {
        let base = package
            .map(package_name)
            .filter(|_| Some(raw) == package)
            .unwrap_or_else(|| raw.to_string());
        let mut variants = vec![base.clone()];
        for suffix in ["-agent-acp", "-acp-agent", "-acp", "-cli", "-code"] {
            if let Some(short) = base.strip_suffix(suffix) {
                variants.push(short.to_string());
            }
        }
        if let Some(short) = base.strip_prefix("github-") {
            variants.push(short.trim_end_matches("-cli").to_string());
        }
        for variant in variants {
            if !variant.is_empty() && !names.contains(&variant) {
                names.push(variant);
            }
        }
    }
    names
}

fn found_command(candidates: &[String]) -> Option<(String, PathBuf)> {
    candidates
        .iter()
        .find_map(|command| resolve_binary(command).map(|path| (command.clone(), path)))
}

fn current_binary(entry: &Value) -> Option<(&str, Vec<String>)> {
    let target = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "darwin-aarch64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "darwin-x86_64"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "linux-aarch64"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x86_64"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "windows-aarch64"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x86_64"
    } else {
        return None;
    };
    let row = entry.get("distribution")?.get("binary")?.get(target)?;
    Some((row.get("cmd")?.as_str()?, strings(row.get("args"))))
}

fn provider(
    id: &str,
    name: &str,
    icon: Option<&str>,
    command: PathBuf,
    args: Vec<String>,
    source: &str,
) -> DiscoveredAcpProvider {
    let path = command.to_string_lossy().into_owned();
    DiscoveredAcpProvider {
        id: canonical_id(id),
        name: name.to_string(),
        icon: icon
            .filter(|url| url.starts_with("https://"))
            .map(str::to_string),
        command: path.clone(),
        args,
        path,
        source: source.to_string(),
    }
}

fn registry_provider(entry: &Value) -> Option<DiscoveredAcpProvider> {
    let id = entry.get("id")?.as_str()?;
    let name = entry.get("name").and_then(Value::as_str).unwrap_or(id);
    let icon = entry.get("icon").and_then(Value::as_str);

    if let Some((command, args)) = current_binary(entry) {
        if let Some(executable) = executable_name(command) {
            if let Some(resolved) = resolve_binary(&executable) {
                return Some(provider(id, name, icon, resolved, args, "ACP registry"));
            }
        }
    }

    for runner in ["npx", "uvx"] {
        let Some(row) = entry
            .get("distribution")
            .and_then(|value| value.get(runner))
        else {
            continue;
        };
        let Some(package) = row.get("package").and_then(Value::as_str) else {
            continue;
        };
        let args = strings(row.get("args"));
        let candidates = candidate_names(id, name, Some(package));
        let Some((matched, installed)) = found_command(&candidates) else {
            continue;
        };
        let package_bin = package_name(package);
        let direct = matched == package_bin
            || matched.contains("acp")
            || args.iter().any(|arg| arg.contains("acp"));
        if direct {
            return Some(provider(id, name, icon, installed, args, "ACP registry"));
        }
        let Some(bridge) = resolve_binary(runner) else {
            continue;
        };
        let mut bridge_args = if runner == "npx" {
            vec!["--yes".to_string(), package.to_string()]
        } else {
            vec![package.to_string()]
        };
        bridge_args.extend(args);
        let mut detected = provider(id, name, icon, bridge, bridge_args, "ACP registry bridge");
        detected.path = installed.to_string_lossy().into_owned();
        return Some(detected);
    }
    None
}

fn local_adapters() -> Vec<DiscoveredAcpProvider> {
    let mut providers = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();
    for directory in discovery_bin_dirs() {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !is_executable(&path) || !seen_paths.insert(path.clone()) {
                continue;
            }
            let Some(command) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !command.to_ascii_lowercase().contains("acp") {
                continue;
            }
            let id = canonical_id(command);
            providers.push(provider(
                &id,
                &title(&id),
                None,
                path,
                Vec::new(),
                "Local ACP executable",
            ));
        }
    }
    providers
}

#[tauri::command]
pub async fn acp_discover(app: AppHandle) -> Vec<DiscoveredAcpProvider> {
    let mut found: HashMap<String, DiscoveredAcpProvider> = local_adapters()
        .into_iter()
        .map(|provider| (provider.id.clone(), provider))
        .collect();
    if let Some(registry) = registry(&app).await {
        for entry in registry
            .get("agents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(provider) = registry_provider(entry) {
                found.insert(provider.id.clone(), provider);
            }
        }
    }
    let mut providers: Vec<_> = found.into_values().collect();
    providers.sort_by(|a, b| {
        a.name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase())
    });
    hydrate_icons(&app, &mut providers).await;
    providers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_open_ended_but_legacy_names_stay_stable() {
        assert_eq!(canonical_id("claude-acp"), "claude-code");
        assert_eq!(canonical_id("Kimi CLI"), "kimi-cli");
        assert_eq!(safe_id("New.Agent_v2"), "new-agent-v2");
    }

    #[test]
    fn candidate_names_are_derived_instead_of_enumerated() {
        let names = candidate_names(
            "github-copilot-cli",
            "GitHub Copilot",
            Some("@github/copilot@1.2.3"),
        );
        assert!(names.contains(&"copilot".to_string()));
        let kimi = candidate_names("kimi", "Kimi CLI", None);
        assert!(kimi.contains(&"kimi".to_string()));
    }

    #[test]
    fn registry_icons_become_local_mask_sources() {
        assert_eq!(
            icon_mime("https://example.test/logo.svg?rev=2"),
            Some(("image/svg+xml", "svg"))
        );
        assert_eq!(icon_mime("https://example.test/logo.txt"), None);
        assert_eq!(
            icon_data_url("image/svg+xml", b"<svg/>"),
            "data:image/svg+xml;base64,PHN2Zy8+"
        );
    }
}
