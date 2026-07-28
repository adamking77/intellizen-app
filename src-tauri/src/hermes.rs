use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, Manager};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
struct HermesConfig {
    api_url: Url,
    api_key: String,
    gateway_url: Url,
    webhook_name: String,
    webhook_secret: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesStreamChatInput {
    request_id: String,
    message: String,
    #[serde(default)]
    history: Vec<HermesChatTurn>,
    system_prompt: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct HermesChatTurn {
    role: String,
    content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesStreamEvent {
    kind: String,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesStreamResult {
    text: String,
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRunStartInput {
    prompt: String,
    instructions: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRunStartResult {
    run_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRunStatus {
    status: String,
    output: Option<String>,
    error: Option<String>,
    usage: Option<HermesUsage>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesUsage {
    input_tokens: u64,
    output_tokens: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesGatewayInput {
    event: String,
    payload: Value,
    profile: Option<String>,
    delivery_id: String,
}

static STREAM_CANCELLATIONS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn stream_cancellations() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    STREAM_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn parse_env(contents: &str) -> HashMap<String, String> {
    contents
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (name, value) = line.split_once('=')?;
            Some((
                name.trim().to_string(),
                value
                    .trim()
                    .trim_matches(|character| character == '\'' || character == '"')
                    .to_string(),
            ))
        })
        .collect()
}

fn config_file_candidates_for_home(home: &Path) -> Vec<PathBuf> {
    vec![home.join(
        "Library/Application Support/IntelliZen/admin-runtime.env",
    )]
}

fn config_file_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    Ok(config_file_candidates_for_home(&home))
}

fn config_value(values: &HashMap<String, String>, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        std::env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                values
                    .get(*name)
                    .cloned()
                    .filter(|value| !value.trim().is_empty())
            })
    })
}

fn loopback_url(value: String, label: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim_end_matches('/'))
        .map_err(|error| format!("{label} is invalid: {error}"))?;
    if url.scheme() != "http" || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
    {
        return Err(format!("{label} must be a loopback HTTP URL."));
    }
    Ok(url)
}

fn load_config(app: &AppHandle) -> Result<HermesConfig, String> {
    let mut values = HashMap::new();
    for path in config_file_candidates(app)? {
        if let Ok(contents) = fs::read_to_string(path) {
            values.extend(parse_env(&contents));
        }
    }
    let api_url = config_value(&values, &["HERMES_API_URL", "VITE_HERMES_API_URL"])
        .ok_or_else(|| "Hermes API URL is not configured.".to_string())?;
    let api_key = config_value(&values, &["HERMES_API_KEY", "VITE_HERMES_API_KEY"])
        .ok_or_else(|| "Hermes API key is not configured.".to_string())?;
    let gateway_url = config_value(&values, &["HERMES_GATEWAY_URL", "VITE_HERMES_GATEWAY_URL"])
        .ok_or_else(|| "Hermes gateway URL is not configured.".to_string())?;
    let webhook_name = config_value(
        &values,
        &["HERMES_WEBHOOK_NAME", "VITE_HERMES_WEBHOOK_NAME"],
    )
    .unwrap_or_else(|| "intellizen".to_string());
    let webhook_secret = config_value(
        &values,
        &["HERMES_WEBHOOK_SECRET", "VITE_HERMES_WEBHOOK_SECRET"],
    )
    .unwrap_or_default();
    Ok(HermesConfig {
        api_url: loopback_url(api_url, "Hermes API URL")?,
        api_key,
        gateway_url: loopback_url(gateway_url, "Hermes gateway URL")?,
        webhook_name,
        webhook_secret,
    })
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| format!("Hermes HTTP client failed: {error}"))
}

fn safe_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

#[tauri::command]
pub async fn hermes_check_api(app: AppHandle) -> Result<bool, String> {
    let config = match load_config(&app) {
        Ok(config) => config,
        Err(_) => return Ok(false),
    };
    let response = client()?
        .get(
            config
                .api_url
                .join("health")
                .map_err(|error| error.to_string())?,
        )
        .bearer_auth(config.api_key)
        .timeout(Duration::from_millis(2_500))
        .send()
        .await;
    Ok(response.is_ok_and(|response| response.status().is_success()))
}

#[tauri::command]
pub async fn hermes_stream_chat(
    app: AppHandle,
    input: HermesStreamChatInput,
    on_event: Channel<HermesStreamEvent>,
) -> Result<HermesStreamResult, String> {
    if !safe_request_id(&input.request_id) {
        return Err("Hermes requestId is invalid.".to_string());
    }
    let config = load_config(&app)?;
    let cancellation = Arc::new(AtomicBool::new(false));
    {
        let mut registry = stream_cancellations()
            .lock()
            .map_err(|_| "Hermes cancellation registry is poisoned.".to_string())?;
        if registry
            .insert(input.request_id.clone(), Arc::clone(&cancellation))
            .is_some()
        {
            return Err("Hermes requestId is already active.".to_string());
        }
    }
    let mut messages = Vec::new();
    if let Some(system_prompt) = input.system_prompt {
        messages.push(json!({ "role": "system", "content": system_prompt }));
    }
    messages.extend(
        input
            .history
            .into_iter()
            .map(|turn| json!({ "role": turn.role, "content": turn.content })),
    );
    messages.push(json!({ "role": "user", "content": input.message }));

    let result = async {
        let response = client()?
            .post(
                config
                    .api_url
                    .join("v1/chat/completions")
                    .map_err(|error| error.to_string())?,
            )
            .bearer_auth(config.api_key)
            .json(&json!({
                "model": "hermes-agent",
                "stream": true,
                "messages": messages,
            }))
            .send()
            .await
            .map_err(|error| format!("Hermes chat failed: {error}"))?;
        let status = response.status();
        let session_id = response
            .headers()
            .get("X-Hermes-Session-Id")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        if !status.is_success() {
            let detail = response.text().await.unwrap_or_default();
            return Err(format!("Hermes chat failed ({status}): {detail}"));
        }
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut output = String::new();
        loop {
            let next = tokio::select! {
                next = stream.next() => next,
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    if cancellation.load(Ordering::SeqCst) {
                        return Err("Hermes chat cancelled.".to_string());
                    }
                    continue;
                }
            };
            let Some(chunk) = next else {
                break;
            };
            let chunk = chunk.map_err(|error| format!("Hermes stream failed: {error}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(index) = buffer.find('\n') {
                let line = buffer[..index].trim().to_string();
                buffer.drain(..=index);
                let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                    continue;
                };
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                let Ok(payload) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                let Some(delta) = payload
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
                else {
                    continue;
                };
                output.push_str(delta);
                let _ = on_event.send(HermesStreamEvent {
                    kind: "delta".to_string(),
                    text: delta.to_string(),
                });
            }
        }
        Ok(HermesStreamResult {
            text: output,
            session_id,
        })
    }
    .await;
    stream_cancellations()
        .lock()
        .map_err(|_| "Hermes cancellation registry is poisoned.".to_string())?
        .remove(&input.request_id);
    result
}

#[tauri::command]
pub fn hermes_cancel_stream(request_id: String) -> Result<bool, String> {
    let registry = stream_cancellations()
        .lock()
        .map_err(|_| "Hermes cancellation registry is poisoned.".to_string())?;
    let Some(cancellation) = registry.get(&request_id) else {
        return Ok(false);
    };
    cancellation.store(true, Ordering::SeqCst);
    Ok(true)
}

#[tauri::command]
pub async fn hermes_run_start(
    app: AppHandle,
    input: HermesRunStartInput,
) -> Result<HermesRunStartResult, String> {
    let config = load_config(&app)?;
    let response = client()?
        .post(
            config
                .api_url
                .join("v1/runs")
                .map_err(|error| error.to_string())?,
        )
        .bearer_auth(config.api_key)
        .timeout(Duration::from_secs(10))
        .json(&json!({
            "input": input.prompt,
            "instructions": input.instructions,
        }))
        .send()
        .await
        .map_err(|error| format!("Hermes run start failed: {error}"))?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Hermes run start returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("Hermes run start failed ({status})."));
    }
    let run_id = payload
        .get("run_id")
        .or_else(|| payload.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Hermes run start returned no run ID.".to_string())?;
    Ok(HermesRunStartResult {
        run_id: run_id.to_string(),
    })
}

#[tauri::command]
pub async fn hermes_run_status(app: AppHandle, run_id: String) -> Result<HermesRunStatus, String> {
    if !safe_request_id(&run_id) {
        return Err("Hermes run ID is invalid.".to_string());
    }
    let config = load_config(&app)?;
    let response = client()?
        .get(
            config
                .api_url
                .join(&format!("v1/runs/{run_id}"))
                .map_err(|error| error.to_string())?,
        )
        .bearer_auth(config.api_key)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|error| format!("Hermes run status failed: {error}"))?;
    let status_code = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Hermes run status returned invalid JSON: {error}"))?;
    if !status_code.is_success() {
        return Err(format!("Hermes run status failed ({status_code})."));
    }
    Ok(HermesRunStatus {
        status: payload
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        output: payload
            .get("output")
            .and_then(Value::as_str)
            .map(str::to_string),
        error: payload
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string),
        usage: payload.get("usage").map(|usage| HermesUsage {
            input_tokens: usage
                .get("input_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            output_tokens: usage
                .get("output_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        }),
    })
}

#[tauri::command]
pub async fn hermes_check_gateway(app: AppHandle) -> Result<bool, String> {
    let config = match load_config(&app) {
        Ok(config) => config,
        Err(_) => return Ok(false),
    };
    let route = format!("webhooks/{}", config.webhook_name);
    let response = client()?
        .request(
            reqwest::Method::OPTIONS,
            config
                .gateway_url
                .join(&route)
                .map_err(|error| error.to_string())?,
        )
        .timeout(Duration::from_millis(2_500))
        .send()
        .await;
    Ok(response.is_ok_and(|response| response.status().is_success()))
}

#[tauri::command]
pub async fn hermes_gateway_submit(
    app: AppHandle,
    input: HermesGatewayInput,
) -> Result<Value, String> {
    if !matches!(
        input.event.as_str(),
        "intellizen.workflow" | "intellizen.chat"
    ) || !safe_request_id(&input.delivery_id)
    {
        return Err("Hermes gateway request is invalid.".to_string());
    }
    let config = load_config(&app)?;
    let body = serde_json::to_string(&input.payload)
        .map_err(|error| format!("Hermes gateway payload is invalid: {error}"))?;
    let route = if let Some(profile) = input.profile {
        if !safe_request_id(&profile) {
            return Err("Hermes profile is invalid.".to_string());
        }
        format!("p/{profile}/webhooks/{}", config.webhook_name)
    } else {
        format!("webhooks/{}", config.webhook_name)
    };
    let mut request = client()?
        .post(
            config
                .gateway_url
                .join(&route)
                .map_err(|error| error.to_string())?,
        )
        .header("Content-Type", "application/json")
        .header("X-GitHub-Event", input.event)
        .header("X-GitHub-Delivery", input.delivery_id)
        .body(body.clone());
    if !config.webhook_secret.is_empty() {
        let mut mac = HmacSha256::new_from_slice(config.webhook_secret.as_bytes())
            .map_err(|_| "Hermes webhook secret is invalid.".to_string())?;
        mac.update(body.as_bytes());
        request = request.header(
            "X-Hub-Signature-256",
            format!("sha256={}", hex::encode(mac.finalize().into_bytes())),
        );
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Hermes webhook failed: {error}"))?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| format!("Hermes webhook returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("Hermes webhook failed ({status})."));
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_urls_only() {
        assert!(loopback_url("http://127.0.0.1:8642".to_string(), "api").is_ok());
        assert!(loopback_url("http://localhost:8642".to_string(), "api").is_ok());
        assert!(loopback_url("https://example.com".to_string(), "api").is_err());
        assert!(loopback_url("file:///tmp/socket".to_string(), "api").is_err());
    }

    #[test]
    fn parses_only_named_local_configuration() {
        let values =
            parse_env("VITE_HERMES_API_KEY='worker-key'\nSUPABASE_SERVICE_ROLE_KEY=admin-key\n");
        assert_eq!(
            config_value(&values, &["HERMES_API_KEY", "VITE_HERMES_API_KEY"]),
            Some("worker-key".to_string()),
        );
        assert!(!values
            .keys()
            .any(|key| key.starts_with("INTELLIZEN_COMPILED_")));
    }

    #[test]
    fn reads_runtime_credentials_only_from_application_support() {
        assert_eq!(
            config_file_candidates_for_home(Path::new("/Users/tester")),
            vec![PathBuf::from(
                "/Users/tester/Library/Application Support/IntelliZen/admin-runtime.env"
            )],
        );
    }
}
