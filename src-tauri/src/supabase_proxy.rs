use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

const LOCAL_ACCESS_HEADER: &str = "x-intellizen-local-access";
const ALLOWED_PATH_PREFIXES: [&str; 5] = [
    "/rest/v1/",
    "/auth/v1/",
    "/storage/v1/",
    "/functions/v1/",
    "/realtime/v1/",
];
const ALLOWED_REQUEST_HEADERS: [&str; 14] = [
    "accept",
    "accept-profile",
    "apikey",
    "authorization",
    "cache-control",
    "content-range",
    "content-type",
    "content-profile",
    "if-match",
    "if-none-match",
    "prefer",
    "range",
    "x-client-info",
    "x-upsert",
];
const ALLOWED_RESPONSE_HEADERS: [&str; 9] = [
    "cache-control",
    "content-disposition",
    "content-range",
    "content-type",
    "etag",
    "location",
    "range-unit",
    "x-sb-error-code",
    "x-supabase-api-version",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseProxyInput {
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    body_base64: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseProxyResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body_base64: String,
}

#[derive(Clone)]
struct SupabaseProxyConfig {
    base_url: Url,
    local_access_key: String,
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

fn config_file_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    Ok(vec![home.join(
        "Library/Application Support/IntelliZen/admin-runtime.env",
    )])
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

fn load_config(app: &AppHandle) -> Result<SupabaseProxyConfig, String> {
    let mut values = HashMap::new();
    for path in config_file_candidates(app)? {
        if let Ok(contents) = fs::read_to_string(path) {
            values.extend(parse_env(&contents));
        }
    }

    let base_url = config_value(&values, &["SUPABASE_URL", "VITE_SUPABASE_URL"])
        .ok_or_else(|| "Supabase URL is not configured.".to_string())?;
    let base_url = Url::parse(base_url.trim_end_matches('/')).map_err(|error| error.to_string())?;
    validate_base_url(&base_url)?;

    let local_access_key = config_value(
        &values,
        &[
            "INTELLIZEN_LOCAL_ACCESS_KEY",
            "VITE_INTELLIZEN_LOCAL_ACCESS_KEY",
        ],
    )
    .ok_or_else(|| "IntelliZen local access key is not configured.".to_string())?;

    Ok(SupabaseProxyConfig {
        base_url,
        local_access_key,
    })
}

fn validate_base_url(url: &Url) -> Result<(), String> {
    let valid_scheme = url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1")));
    if !valid_scheme || url.cannot_be_a_base() || url.host_str().is_none() {
        return Err("Supabase URL must be HTTPS or loopback HTTP.".to_string());
    }
    Ok(())
}

fn validate_target(base_url: &Url, target: &Url) -> Result<(), String> {
    if base_url.scheme() != target.scheme()
        || base_url.host_str() != target.host_str()
        || base_url.port_or_known_default() != target.port_or_known_default()
    {
        return Err("Supabase proxy target must match the configured origin.".to_string());
    }
    if !ALLOWED_PATH_PREFIXES
        .iter()
        .any(|prefix| target.path().starts_with(prefix))
    {
        return Err("Supabase proxy target path is not allowed.".to_string());
    }
    if !target.username().is_empty() || target.password().is_some() {
        return Err("Supabase proxy target credentials are not allowed.".to_string());
    }
    Ok(())
}

fn parse_method(value: &str) -> Result<Method, String> {
    let method = Method::from_bytes(value.as_bytes()).map_err(|error| error.to_string())?;
    if matches!(
        method,
        Method::GET
            | Method::HEAD
            | Method::POST
            | Method::PUT
            | Method::PATCH
            | Method::DELETE
            | Method::OPTIONS
    ) {
        Ok(method)
    } else {
        Err("Supabase proxy method is not allowed.".to_string())
    }
}

fn request_headers(
    values: Vec<(String, String)>,
    local_access_key: &str,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for (name, value) in values {
        let normalized = name.to_ascii_lowercase();
        if !ALLOWED_REQUEST_HEADERS.contains(&normalized.as_str()) {
            continue;
        }
        let name = HeaderName::from_bytes(normalized.as_bytes())
            .map_err(|error| format!("Invalid Supabase request header: {error}"))?;
        let value = HeaderValue::from_str(&value)
            .map_err(|error| format!("Invalid Supabase request header value: {error}"))?;
        headers.insert(name, value);
    }
    headers.insert(
        HeaderName::from_static(LOCAL_ACCESS_HEADER),
        HeaderValue::from_str(local_access_key)
            .map_err(|_| "Configured local access key is not a valid header value.".to_string())?,
    );
    Ok(headers)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Supabase proxy client failed: {error}"))
}

#[tauri::command]
pub async fn supabase_proxy_request(
    app: AppHandle,
    input: SupabaseProxyInput,
) -> Result<SupabaseProxyResponse, String> {
    let config = load_config(&app)?;
    let target = Url::parse(&input.url).map_err(|error| error.to_string())?;
    validate_target(&config.base_url, &target)?;
    let method = parse_method(&input.method)?;
    let headers = request_headers(input.headers, &config.local_access_key)?;
    let body = input
        .body_base64
        .map(|value| {
            BASE64
                .decode(value)
                .map_err(|_| "Supabase proxy request body is not valid base64.".to_string())
        })
        .transpose()?;

    let mut request = client()?.request(method, target).headers(headers);
    if let Some(body) = body {
        request = request.body(body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Supabase proxy request failed: {error}"))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            let normalized = name.as_str().to_ascii_lowercase();
            if !ALLOWED_RESPONSE_HEADERS.contains(&normalized.as_str()) {
                return None;
            }
            value
                .to_str()
                .ok()
                .map(|value| (normalized, value.to_string()))
        })
        .collect();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read Supabase proxy response: {error}"))?;

    Ok(SupabaseProxyResponse {
        status: status.as_u16(),
        status_text: status
            .canonical_reason()
            .unwrap_or("Supabase response")
            .to_string(),
        headers,
        body_base64: BASE64.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_must_match_origin_and_allowed_surface() {
        let base = Url::parse("https://example.supabase.co").unwrap();
        assert!(validate_target(
            &base,
            &Url::parse("https://example.supabase.co/rest/v1/records?select=id").unwrap()
        )
        .is_ok());
        assert!(validate_target(
            &base,
            &Url::parse("https://evil.example/rest/v1/records").unwrap()
        )
        .is_err());
        assert!(validate_target(
            &base,
            &Url::parse("https://example.supabase.co/unsafe").unwrap()
        )
        .is_err());
    }

    #[test]
    fn request_headers_are_allowlisted_and_host_adds_local_access() {
        let headers = request_headers(
            vec![
                ("authorization".to_string(), "Bearer anon".to_string()),
                ("accept-profile".to_string(), "workspace".to_string()),
                ("content-profile".to_string(), "workspace".to_string()),
                ("cookie".to_string(), "forbidden".to_string()),
                (LOCAL_ACCESS_HEADER.to_string(), "webview-spoof".to_string()),
            ],
            "native-only",
        )
        .unwrap();
        assert_eq!(
            headers.get("authorization").unwrap().to_str().unwrap(),
            "Bearer anon"
        );
        assert!(headers.get("cookie").is_none());
        assert_eq!(
            headers.get("accept-profile").unwrap().to_str().unwrap(),
            "workspace"
        );
        assert_eq!(
            headers.get("content-profile").unwrap().to_str().unwrap(),
            "workspace"
        );
        assert_eq!(
            headers.get(LOCAL_ACCESS_HEADER).unwrap().to_str().unwrap(),
            "native-only"
        );
    }

    #[test]
    fn base_url_requires_https_or_loopback_http() {
        assert!(validate_base_url(&Url::parse("https://example.supabase.co").unwrap()).is_ok());
        assert!(validate_base_url(&Url::parse("http://127.0.0.1:54321").unwrap()).is_ok());
        assert!(validate_base_url(&Url::parse("http://example.supabase.co").unwrap()).is_err());
    }
}
