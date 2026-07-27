use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
};

const MIN_TIMEOUT_MS: u64 = 50;
const MAX_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const TERMINATION_GRACE_MS: u64 = 1_000;
const ALLOWED_ENVIRONMENT: &[&str] = &[
    "CLAUDE_CONFIG_DIR",
    "CODEX_HOME",
    "INTELLIZEN_WORKER_CAPABILITY_TOKEN",
    "INTELLIZEN_WORKER_CAPABILITY_URL",
    "NO_COLOR",
    "TERM",
];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRunInput {
    pub run_id: String,
    pub binary: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub working_directory: String,
    pub stdin: Option<String>,
    pub timeout_ms: u64,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeEvent {
    pub sequence: u64,
    pub kind: String,
    pub text: Option<String>,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExit {
    pub reason: String,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiscovery {
    adapter_id: String,
    installed: bool,
    binary: String,
    version: String,
    supported: bool,
    auth_state: String,
    worker_profile_home: String,
}

#[derive(Clone, Copy)]
struct ProcessState {
    pid: i32,
    cancellation_requested: bool,
}

static PROCESS_REGISTRY: OnceLock<Mutex<HashMap<String, ProcessState>>> = OnceLock::new();
pub(crate) type EventSink = Arc<dyn Fn(NativeRuntimeEvent) + Send + Sync>;

fn process_registry() -> &'static Mutex<HashMap<String, ProcessState>> {
    PROCESS_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remove_process(run_id: &str) -> Result<(), String> {
    process_registry()
        .lock()
        .map_err(|_| "Runtime process registry is poisoned.".to_string())?
        .remove(run_id);
    Ok(())
}

fn has_parent_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn canonical_file(path: &str, label: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || has_parent_component(&path) {
        return Err(format!(
            "{label} must be an absolute path without parent traversal."
        ));
    }
    let canonical =
        std::fs::canonicalize(&path).map_err(|error| format!("{label} is invalid: {error}"))?;
    if !canonical.is_file() {
        return Err(format!("{label} must resolve to a file."));
    }
    Ok(canonical)
}

fn canonical_directory(path: &str, label: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || has_parent_component(&path) {
        return Err(format!(
            "{label} must be an absolute path without parent traversal."
        ));
    }
    let canonical =
        std::fs::canonicalize(&path).map_err(|error| format!("{label} is invalid: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("{label} must resolve to a directory."));
    }
    Ok(canonical)
}

fn validate_input(input: &RuntimeRunInput) -> Result<(PathBuf, PathBuf), String> {
    if input.run_id.is_empty()
        || input.run_id.len() > 128
        || !input
            .run_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("runId must be 1-128 safe identifier characters.".to_string());
    }
    if !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&input.timeout_ms) {
        return Err(format!(
            "timeoutMs must be between {MIN_TIMEOUT_MS} and {MAX_TIMEOUT_MS}."
        ));
    }
    if input
        .args
        .iter()
        .any(|argument| argument.contains('\0') || argument.len() > 32_768)
    {
        return Err("Runtime arguments contain an invalid value.".to_string());
    }
    for (name, value) in &input.environment {
        if !ALLOWED_ENVIRONMENT.contains(&name.as_str()) {
            return Err(format!(
                "Runtime environment variable {name} is not in the sanitized allowlist."
            ));
        }
        if value.contains('\0') {
            return Err("Runtime environment contains an invalid value.".to_string());
        }
    }
    Ok((
        canonical_file(&input.binary, "binary")?,
        canonical_directory(&input.working_directory, "workingDirectory")?,
    ))
}

fn emit(
    sink: &EventSink,
    sequence: &AtomicU64,
    kind: &str,
    text: Option<String>,
    exit_code: Option<i32>,
) {
    sink(NativeRuntimeEvent {
        sequence: sequence.fetch_add(1, Ordering::SeqCst),
        kind: kind.to_string(),
        text,
        exit_code,
    });
}

#[cfg(unix)]
fn signal_process_group(pid: i32, signal: i32) -> Result<(), String> {
    let result = unsafe { libc::kill(-pid, signal) };
    if result == 0 {
        Ok(())
    } else {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            Ok(())
        } else {
            Err(format!("Failed to signal runtime process group: {error}"))
        }
    }
}

#[cfg(not(unix))]
fn signal_process_group(_pid: i32, _signal: i32) -> Result<(), String> {
    Err("Runtime process groups are supported only on Unix.".to_string())
}

pub(crate) async fn run_process(
    input: RuntimeRunInput,
    sink: EventSink,
) -> Result<RuntimeExit, String> {
    let (binary, working_directory) = validate_input(&input)?;
    let sequence = Arc::new(AtomicU64::new(0));
    let mut command = Command::new(binary);
    command
        .args(&input.args)
        .current_dir(working_directory)
        .env_clear()
        .env("LANG", "C.UTF-8")
        .env("LC_ALL", "C.UTF-8")
        .envs(&input.environment)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    command.process_group(0);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to spawn runtime: {error}"))?;
    let pid = child
        .id()
        .ok_or_else(|| "Runtime process has no process ID.".to_string())? as i32;

    {
        let mut registry = process_registry()
            .lock()
            .map_err(|_| "Runtime process registry is poisoned.".to_string())?;
        if registry.contains_key(&input.run_id) {
            let _ = signal_process_group(pid, libc::SIGKILL);
            return Err(format!("Runtime run {} is already active.", input.run_id));
        }
        registry.insert(
            input.run_id.clone(),
            ProcessState {
                pid,
                cancellation_requested: false,
            },
        );
    }

    emit(&sink, &sequence, "spawned", None, None);

    if let Some(stdin_payload) = input.stdin {
        if let Some(mut stdin) = child.stdin.take() {
            let stdin_result = stdin.write_all(stdin_payload.as_bytes()).await;
            let shutdown_result = stdin.shutdown().await;
            if let Err(error) = stdin_result.and(shutdown_result) {
                let _ = signal_process_group(pid, libc::SIGKILL);
                let _ = child.wait().await;
                remove_process(&input.run_id)?;
                return Err(format!("Failed to deliver runtime stdin: {error}"));
            }
        }
    } else {
        drop(child.stdin.take());
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Runtime stdout was not captured.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Runtime stderr was not captured.".to_string())?;

    let stdout_sink = Arc::clone(&sink);
    let stdout_sequence = Arc::clone(&sequence);
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit(&stdout_sink, &stdout_sequence, "stdout", Some(line), None);
        }
    });
    let stderr_sink = Arc::clone(&sink);
    let stderr_sequence = Arc::clone(&sequence);
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit(&stderr_sink, &stderr_sequence, "stderr", Some(line), None);
        }
    });

    let wait_result =
        tokio::time::timeout(Duration::from_millis(input.timeout_ms), child.wait()).await;
    let (reason, status) = match wait_result {
        Ok(result) => {
            let status = result.map_err(|error| format!("Failed to wait for runtime: {error}"))?;
            let cancelled = process_registry()
                .lock()
                .map_err(|_| "Runtime process registry is poisoned.".to_string())?
                .get(&input.run_id)
                .is_some_and(|state| state.cancellation_requested);
            (
                if cancelled {
                    "cancelled"
                } else if status.success() {
                    "completed"
                } else {
                    "failed"
                },
                Some(status),
            )
        }
        Err(_) => {
            signal_process_group(pid, libc::SIGTERM)?;
            let status = match tokio::time::timeout(
                Duration::from_millis(TERMINATION_GRACE_MS),
                child.wait(),
            )
            .await
            {
                Ok(result) => Some(
                    result.map_err(|error| format!("Failed to reap timed-out runtime: {error}"))?,
                ),
                Err(_) => {
                    signal_process_group(pid, libc::SIGKILL)?;
                    Some(
                        child
                            .wait()
                            .await
                            .map_err(|error| format!("Failed to reap killed runtime: {error}"))?,
                    )
                }
            };
            ("timed_out", status)
        }
    };

    let _ = stdout_task.await;
    let _ = stderr_task.await;
    remove_process(&input.run_id)?;

    let exit_code = status.and_then(|status| status.code());
    emit(&sink, &sequence, reason, None, exit_code);
    Ok(RuntimeExit {
        reason: reason.to_string(),
        exit_code,
    })
}

#[tauri::command]
pub async fn runtime_run(
    input: RuntimeRunInput,
    on_event: Channel<NativeRuntimeEvent>,
) -> Result<RuntimeExit, String> {
    run_process(
        input,
        Arc::new(move |event| {
            let _ = on_event.send(event);
        }),
    )
    .await
}

#[tauri::command]
pub fn runtime_cancel(run_id: String) -> Result<bool, String> {
    let pid = {
        let mut registry = process_registry()
            .lock()
            .map_err(|_| "Runtime process registry is poisoned.".to_string())?;
        let Some(state) = registry.get_mut(&run_id) else {
            return Ok(false);
        };
        state.cancellation_requested = true;
        state.pid
    };
    signal_process_group(pid, libc::SIGTERM)?;
    Ok(true)
}

#[tauri::command]
pub fn runtime_discover_codex(app: AppHandle) -> Result<RuntimeDiscovery, String> {
    const CODEX_BINARY: &str = "/Users/adamking/.local/bin/codex";
    const SUPPORTED_VERSION: &str = "codex-cli 0.145.0";
    let worker_profile_home = app
        .path()
        .home_dir()
        .map_err(|error| error.to_string())?
        .join("Library/Application Support/IntelliZen/worker-profiles/codex-local-primary");
    let binary = PathBuf::from(CODEX_BINARY);
    if !binary.is_file() {
        return Ok(RuntimeDiscovery {
            adapter_id: "codex-cli".to_string(),
            installed: false,
            binary: CODEX_BINARY.to_string(),
            version: String::new(),
            supported: false,
            auth_state: "unavailable".to_string(),
            worker_profile_home: worker_profile_home.to_string_lossy().into_owned(),
        });
    }
    let version_output = std::process::Command::new(&binary)
        .arg("--version")
        .env_clear()
        .output()
        .map_err(|error| format!("Failed to inspect Codex version: {error}"))?;
    let version = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_string();
    let auth_state = if worker_profile_home.is_dir() {
        let status = std::process::Command::new(&binary)
            .args(["login", "status"])
            .env_clear()
            .env("CODEX_HOME", &worker_profile_home)
            .status()
            .map_err(|error| format!("Failed to inspect Codex auth: {error}"))?;
        if status.success() {
            "ready"
        } else {
            "login_required"
        }
    } else {
        "login_required"
    };
    Ok(RuntimeDiscovery {
        adapter_id: "codex-cli".to_string(),
        installed: version_output.status.success(),
        binary: binary.to_string_lossy().into_owned(),
        supported: version == SUPPORTED_VERSION,
        version,
        auth_state: auth_state.to_string(),
        worker_profile_home: worker_profile_home.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::Mutex as StdMutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "intellizen-runtime-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("test root");
        root
    }

    fn shell_input(run_id: &str, root: &Path, script: &str, timeout_ms: u64) -> RuntimeRunInput {
        RuntimeRunInput {
            run_id: run_id.to_string(),
            binary: "/bin/sh".to_string(),
            args: vec!["-c".to_string(), script.to_string()],
            working_directory: root.to_string_lossy().into_owned(),
            stdin: None,
            timeout_ms,
            environment: BTreeMap::new(),
        }
    }

    fn mock_input(run_id: &str, root: &Path, mode: &str, timeout_ms: u64) -> RuntimeRunInput {
        let binary = fs::canonicalize(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/runtime-mock.sh"),
        )
        .expect("mock runtime binary");
        RuntimeRunInput {
            run_id: run_id.to_string(),
            binary: binary.to_string_lossy().into_owned(),
            args: vec![mode.to_string()],
            working_directory: root.to_string_lossy().into_owned(),
            stdin: None,
            timeout_ms,
            environment: BTreeMap::new(),
        }
    }

    type CapturedEvents = Arc<StdMutex<Vec<NativeRuntimeEvent>>>;

    fn event_sink() -> (CapturedEvents, EventSink) {
        let events = Arc::new(StdMutex::new(Vec::new()));
        let captured = Arc::clone(&events);
        let sink = Arc::new(move |event| captured.lock().expect("event lock").push(event));
        (events, sink)
    }

    #[tokio::test]
    async fn streams_stdout_stderr_and_delivers_stdin() {
        let root = test_root("stream");
        let (events, sink) = event_sink();
        let mut input = mock_input("stream-test", &root, "normal", 2_000);
        input.stdin = Some("hello\n".to_string());
        let exit = run_process(input, sink).await.expect("runtime exit");
        assert_eq!(exit.reason, "completed");
        let events = events.lock().expect("events");
        assert!(events.iter().any(|event| event.kind == "stdout"
            && event
                .text
                .as_deref()
                .is_some_and(|text| text.contains("\"text\":\"hello\""))));
        assert!(events.iter().any(|event| event.kind == "stdout"
            && event
                .text
                .as_deref()
                .is_some_and(|text| text.contains("\"type\":\"run.completed\""))));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[tokio::test]
    async fn clears_inherited_credentials_and_rejects_unapproved_environment() {
        let root = test_root("environment");
        let (events, sink) = event_sink();
        let input = shell_input(
            "environment-test",
            &root,
            "printf '%s\\n' \"${SUPABASE_SERVICE_ROLE_KEY-unset}\"",
            2_000,
        );
        let exit = run_process(input, sink).await.expect("runtime exit");
        assert_eq!(exit.reason, "completed");
        assert!(events
            .lock()
            .expect("events")
            .iter()
            .any(|event| event.text.as_deref() == Some("unset")));

        let mut rejected = shell_input("environment-rejected", &root, "true", 2_000);
        rejected.environment.insert(
            "SUPABASE_SERVICE_ROLE_KEY".to_string(),
            "canary".to_string(),
        );
        assert!(validate_input(&rejected)
            .expect_err("admin credential must reject")
            .contains("sanitized allowlist"));

        let mut capability = shell_input("environment-capability", &root, "true", 2_000);
        capability.environment.insert(
            "INTELLIZEN_WORKER_CAPABILITY_URL".to_string(),
            "http://127.0.0.1:49152/capability".to_string(),
        );
        capability.environment.insert(
            "INTELLIZEN_WORKER_CAPABILITY_TOKEN".to_string(),
            "opaque-runtime-value".to_string(),
        );
        validate_input(&capability).expect("capability environment");

        let mut stale_alias = shell_input("environment-stale-alias", &root, "true", 2_000);
        stale_alias.environment.insert(
            "INTELLIZEN_WORKER_BROKER_URL".to_string(),
            "http://127.0.0.1:49152/capability".to_string(),
        );
        assert!(validate_input(&stale_alias)
            .expect_err("stale broker alias must reject")
            .contains("sanitized allowlist"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[tokio::test]
    async fn timeout_terminates_the_process_group() {
        let root = test_root("timeout");
        let (events, sink) = event_sink();
        let input = mock_input("timeout-test", &root, "hang-with-child", 100);
        let exit = run_process(input, sink).await.expect("runtime exit");
        assert_eq!(exit.reason, "timed_out");
        let child_pid: i32 = fs::read_to_string(root.join("child.pid"))
            .expect("child pid")
            .trim()
            .parse()
            .expect("numeric child pid");
        let alive = unsafe { libc::kill(child_pid, 0) } == 0;
        assert!(!alive, "timed-out child process survived");
        assert!(events
            .lock()
            .expect("events")
            .iter()
            .any(|event| event.kind == "timed_out"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[tokio::test]
    async fn cancellation_marks_truthful_terminal_state() {
        let root = test_root("cancel");
        let (events, sink) = event_sink();
        let input = mock_input("cancel-test", &root, "hang-with-child", 5_000);
        let run = tokio::spawn(run_process(input, sink));
        for _ in 0..100 {
            if process_registry()
                .lock()
                .expect("registry")
                .contains_key("cancel-test")
                && root.join("child.pid").is_file()
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(runtime_cancel("cancel-test".to_string()).expect("cancel"));
        let exit = run.await.expect("join").expect("runtime exit");
        assert_eq!(exit.reason, "cancelled");
        let child_pid: i32 = fs::read_to_string(root.join("child.pid"))
            .expect("child pid")
            .trim()
            .parse()
            .expect("numeric child pid");
        let alive = unsafe { libc::kill(child_pid, 0) } == 0;
        assert!(!alive, "cancelled child process survived");
        assert!(events
            .lock()
            .expect("events")
            .iter()
            .any(|event| event.kind == "cancelled"));
        fs::remove_dir_all(root).expect("cleanup");
    }
}
