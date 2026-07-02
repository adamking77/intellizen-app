use std::{env, fs, path::PathBuf, sync::OnceLock, time::Duration};

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const EXA_API_BASE: &str = "https://api.exa.ai";
const EXA_SEARCH_CONTENTS: &str = "/search";
const EXA_RESEARCH_PATH: &str = "/research/v1";
const COMPILED_EXA_API_KEY: Option<&str> = option_env!("INTELLIZEN_COMPILED_EXA_API_KEY");
static EXA_API_KEY: OnceLock<Result<String, String>> = OnceLock::new();
static EXA_CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExaSearchInput {
    mode: String,
    query: String,
    start_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ExaSearchResponse {
    List(Vec<SearchResultItem>),
    Deep(DeepResearchResult),
}

#[derive(Debug, Serialize)]
struct SearchResultItem {
    title: String,
    url: String,
    source: Option<String>,
    published_at: Option<String>,
    snippet: Option<String>,
    exa_score: Option<f64>,
    raw_payload: Value,
}

#[derive(Debug, Serialize)]
struct DeepResearchResult {
    title: String,
    url: String,
    source: String,
    snippet: String,
    content: String,
    raw_payload: Value,
}

#[derive(Debug, Deserialize)]
struct ExaSearchResultsPayload {
    results: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct DeepResearchStartPayload {
    id: String,
}

#[derive(Debug, Deserialize)]
struct DeepResearchPollPayload {
    status: String,
    data: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn run_exa_search(input: ExaSearchInput) -> Result<ExaSearchResponse, String> {
    let client = get_exa_client()?;

    match input.mode.as_str() {
        "web" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "type": "auto",
                    "useAutoprompt": true,
                    "numResults": 10,
                    "contents": {
                        "highlights": {
                            "numSentences": 3,
                            "highlightsPerUrl": 1
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "news" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "type": "auto",
                    "category": "news",
                    "numResults": 10,
                    "startPublishedDate": input.start_date,
                    "contents": {
                        "highlights": {
                            "numSentences": 3,
                            "highlightsPerUrl": 1
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "research_papers" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "category": "research paper",
                    "numResults": 10,
                    "contents": {
                        "highlights": {
                            "numSentences": 3,
                            "highlightsPerUrl": 1
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "company" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "category": "company",
                    "numResults": 10,
                    "contents": {
                        "text": {
                            "maxCharacters": 10000
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "people" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "category": "personal site",
                    "numResults": 10,
                    "contents": {
                        "text": {
                            "maxCharacters": 10000
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "financial_reports" => {
            let payload = post_exa(
                client,
                EXA_SEARCH_CONTENTS,
                json!({
                    "query": input.query,
                    "category": "financial report",
                    "numResults": 10,
                    "contents": {
                        "text": {
                            "maxCharacters": 10000
                        }
                    }
                }),
            )
            .await?;
            Ok(ExaSearchResponse::List(normalize_search_results(
                payload.results,
            )))
        }
        "deep_research" => {
            let started = post_exa_raw(
                client,
                EXA_RESEARCH_PATH,
                json!({
                    "instructions": input.query,
                    "model": "exa-research"
                }),
            )
            .await?;
            let started: DeepResearchStartPayload =
                serde_json::from_value(started).map_err(|err| err.to_string())?;
            let content = poll_deep_research(client, &started.id).await?;

            Ok(ExaSearchResponse::Deep(DeepResearchResult {
                title: format!("Deep Research: {}", input.query),
                url: format!("exa://research/{}", started.id),
                source: "exa.ai".to_string(),
                snippet: summarize_text(&content, 240)
                    .unwrap_or_else(|| "Deep Research completed.".to_string()),
                content: content.clone(),
                raw_payload: json!({
                    "id": started.id,
                    "content": content
                }),
            }))
        }
        _ => Err(format!("Unsupported search mode: {}", input.mode)),
    }
}

async fn post_exa(
    client: &Client,
    path: &str,
    body: Value,
) -> Result<ExaSearchResultsPayload, String> {
    let payload = post_exa_raw(client, path, body).await?;
    serde_json::from_value(payload).map_err(|err| err.to_string())
}

async fn post_exa_raw(client: &Client, path: &str, body: Value) -> Result<Value, String> {
    let response = client
        .post(format!("{EXA_API_BASE}{path}"))
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("Exa request failed: {err}"))?;

    let status = response.status();
    let payload = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Exa response: {err}"))?;

    if !status.is_success() {
        if let Ok(value) = serde_json::from_str::<Value>(&payload) {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| value.get("error").and_then(Value::as_str))
                .unwrap_or(payload.as_str());
            return Err(format!("Exa request failed ({status}): {message}"));
        }

        return Err(format!("Exa request failed ({status}): {payload}"));
    }

    serde_json::from_str(&payload).map_err(|err| format!("Invalid Exa response: {err}"))
}

async fn poll_deep_research(client: &Client, id: &str) -> Result<String, String> {
    loop {
        let response = client
            .get(format!("{EXA_API_BASE}{EXA_RESEARCH_PATH}/{id}"))
            .send()
            .await
            .map_err(|err| format!("Deep Research poll failed: {err}"))?;

        let status = response.status();
        let payload = response
            .text()
            .await
            .map_err(|err| format!("Failed to read Deep Research response: {err}"))?;

        if !status.is_success() {
            return Err(format!("Deep Research poll failed ({status}): {payload}"));
        }

        let payload: DeepResearchPollPayload = serde_json::from_str(&payload)
            .map_err(|err| format!("Invalid Deep Research response: {err}"))?;

        match payload.status.as_str() {
            "completed" => return Ok(payload.data.unwrap_or_default()),
            "failed" => {
                return Err(payload
                    .error
                    .unwrap_or_else(|| "Deep Research failed.".to_string()))
            }
            "pending" => tokio::time::sleep(Duration::from_secs(2)).await,
            other => return Err(format!("Unexpected Deep Research status: {other}")),
        }
    }
}

fn normalize_search_results(results: Vec<Value>) -> Vec<SearchResultItem> {
    results
        .into_iter()
        .filter_map(|result| {
            let url = result.get("url")?.as_str()?.to_string();
            let source = safe_hostname(&url);
            let title = result
                .get("title")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| source.clone());
            let snippet = result
                .get("highlights")
                .and_then(Value::as_array)
                .and_then(|highlights| highlights.first())
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| {
                    result
                        .get("text")
                        .and_then(Value::as_str)
                        .and_then(|text| summarize_text(text, 180))
                });

            Some(SearchResultItem {
                title,
                url,
                source: Some(source),
                published_at: result
                    .get("publishedDate")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                snippet,
                exa_score: result.get("score").and_then(Value::as_f64),
                raw_payload: result,
            })
        })
        .collect()
}

fn safe_hostname(value: &str) -> String {
    Url::parse(value)
        .ok()
        .and_then(|url| url.host_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| value.to_string())
}

fn summarize_text(value: &str, max: usize) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.chars().count() <= max {
        return Some(trimmed.to_string());
    }

    let summary: String = trimmed.chars().take(max).collect();
    Some(format!("{}...", summary.trim()))
}

fn build_exa_client(api_key: &str) -> Result<Client, String> {
    Client::builder()
        .user_agent("intellizen-desktop")
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "x-api-key",
                reqwest::header::HeaderValue::from_str(api_key)
                    .map_err(|err| format!("Invalid Exa API key: {err}"))?,
            );
            headers.insert(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json"),
            );
            headers
        })
        .build()
        .map_err(|err| format!("Failed to initialize Exa client: {err}"))
}

fn get_exa_client() -> Result<&'static Client, String> {
    match EXA_CLIENT.get_or_init(|| {
        let api_key = resolve_exa_api_key()?;
        build_exa_client(api_key)
    }) {
        Ok(client) => Ok(client),
        Err(err) => Err(err.clone()),
    }
}

fn resolve_exa_api_key() -> Result<&'static str, String> {
    match EXA_API_KEY.get_or_init(resolve_exa_api_key_uncached) {
        Ok(value) => Ok(value.as_str()),
        Err(err) => Err(err.clone()),
    }
}

fn resolve_exa_api_key_uncached() -> Result<String, String> {
    for key_name in ["EXA_API_KEY", "VITE_EXA_API_KEY"] {
        if let Ok(value) = env::var(key_name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    if let Some(value) = COMPILED_EXA_API_KEY {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    for path in env_file_candidates() {
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };

        for key_name in ["EXA_API_KEY", "VITE_EXA_API_KEY"] {
            if let Some(value) = parse_env_var(&contents, key_name) {
                return Ok(value);
            }
        }
    }

    Err("Missing Exa API key. Set EXA_API_KEY or VITE_EXA_API_KEY.".to_string())
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from(".env.local"), PathBuf::from(".env")];

    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            candidates.push(parent.join(".env.local"));
            candidates.push(parent.join(".env"));

            if let Some(grandparent) = parent.parent() {
                candidates.push(grandparent.join(".env.local"));
                candidates.push(grandparent.join(".env"));
            }
        }
    }

    candidates
}

fn parse_env_var(contents: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");

    contents.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || !trimmed.starts_with(&prefix) {
            return None;
        }

        let value = trimmed[prefix.len()..].trim();
        Some(strip_wrapping_quotes(value).to_string())
    })
}

fn strip_wrapping_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|inner| inner.strip_suffix('\''))
        })
        .unwrap_or(value)
}

/// GenUI sandbox frame shell. Served via a custom protocol because Tauri
/// injects the app CSP into every HTML asset in dist at build time, which
/// would re-block the sandbox's inline scripts (the shell must carry ONLY
/// its own no-network CSP). Protocol responses bypass that injection.
const GENUI_FRAME_HTML: &str = include_str!("../../public/genui-frame.html");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .register_uri_scheme_protocol("genui", |_ctx, _request| {
            tauri::http::Response::builder()
                .header("Content-Type", "text/html; charset=utf-8")
                .body(GENUI_FRAME_HTML.as_bytes().to_vec())
                .expect("genui frame response")
        })
        .invoke_handler(tauri::generate_handler![run_exa_search])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
