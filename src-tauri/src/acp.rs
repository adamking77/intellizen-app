//! ACP over stdio: Claude Code, Codex, Gemini and Qwen as agents.
//!
//! JSON-RPC 2.0, one message per line, from `hermes-app/crates/agent/src/acp.rs`.
//! The handshake is three steps and the second is easy to miss: `initialize`
//! (request), `initialized` (notification), then `session/new`. Events reach
//! the webview as `acp:event` with the gateway's event names and payload
//! shapes (`src/engine/contract.ts`), so the transcript reducer needs no
//! second code path. A `session/request_permission` becomes an
//! `approval.request` carrying the adapter's real options.

use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex as StdMutex, OnceLock,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::acp_wire::{permission_payload, text, translate_update};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    task::JoinHandle,
};

pub const EVENT_NAME: &str = "acp:event";
const REGISTRY_FILE: &str = "acp-agents.json";
/// `hermes acp` measured eight seconds cold; adapters run through `npx` can
/// take longer the first time.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(60);
const TURN_TIMEOUT: Duration = Duration::from_secs(600);
const STDERR_TAIL_LINES: usize = 20;
const PROTOCOL_VERSION: u64 = 1;

/// The registry fields the spawner needs. The TypeScript side owns the full
/// shape (`src/engine/acp-registry.ts`); unknown fields pass through untouched.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentSpawn {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
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
pub struct AcpCommandProbe {
    pub command: String,
    pub available: bool,
    pub path: Option<String>,
}

/// Where an event goes: the app emits to the webview, tests collect.
type Sink = Arc<dyn Fn(&str, Value) + Send + Sync>;
type StderrTail = Arc<StdMutex<VecDeque<String>>>;

struct PendingPermission {
    rpc_id: Value,
}

/// A running adapter process and its one session.
struct Live {
    agent_id: String,
    session_id: OnceLock<String>,
    pid: Option<u32>,
    child: StdMutex<Option<Child>>,
    stdin: Mutex<ChildStdin>,
    next_id: AtomicI64,
    pending: StdMutex<HashMap<i64, oneshot::Sender<Result<Value, String>>>>,
    permissions: StdMutex<HashMap<String, PendingPermission>>,
    tool_started: StdMutex<HashMap<String, Instant>>,
    turn_running: StdMutex<bool>,
    reader: StdMutex<Option<JoinHandle<()>>>,
    sink: Sink,
}

fn agents() -> &'static StdMutex<HashMap<String, Arc<Live>>> {
    static AGENTS: OnceLock<StdMutex<HashMap<String, Arc<Live>>>> = OnceLock::new();
    AGENTS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn live(agent_id: &str) -> Result<Arc<Live>, String> {
    agents()
        .lock()
        .map_err(|_| "the agent table is poisoned".to_string())?
        .get(agent_id)
        .cloned()
        .ok_or_else(|| format!("{agent_id} is not running"))
}

// ── Binaries and paths ──────────────────────────────────────────────────

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// `~` is a shell convention, not a filesystem one.
fn expand_tilde(value: &str) -> PathBuf {
    if let Some(rest) = value.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    if value == "~" {
        if let Some(home) = home_dir() {
            return home;
        }
    }
    PathBuf::from(value)
}

/// Directories a CLI tends to live in when the app was launched from Finder
/// and inherited the login PATH rather than the shell's.
fn known_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home_dir() {
        for rel in [
            ".local/bin",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".cargo/bin",
        ] {
            dirs.push(home.join(rel));
        }
        if let Ok(versions) = fs::read_dir(home.join(".nvm/versions/node")) {
            for entry in versions.flatten() {
                dirs.push(entry.path().join("bin"));
            }
        }
    }
    for abs in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        dirs.push(PathBuf::from(abs));
    }
    dirs
}

/// The PATH a child gets: the known directories ahead of whatever we inherited.
fn child_path() -> String {
    let mut parts: Vec<PathBuf> = known_bin_dirs();
    if let Some(inherited) = std::env::var_os("PATH") {
        parts.extend(std::env::split_paths(&inherited));
    }
    std::env::join_paths(parts.iter().filter(|p| p.is_dir()))
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn resolve_binary(command: &str) -> Option<PathBuf> {
    let direct = expand_tilde(command);
    if direct.components().count() > 1 {
        return direct.is_file().then_some(direct);
    }
    let mut dirs = Vec::new();
    if let Some(inherited) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&inherited));
    }
    dirs.extend(known_bin_dirs());
    dirs.into_iter()
        .map(|dir| dir.join(command))
        .find(|candidate| candidate.is_file())
}

fn resolve_cwd(cwd: Option<&str>) -> PathBuf {
    cwd.map(expand_tilde)
        .filter(|p| p.is_dir())
        .or_else(home_dir)
        .unwrap_or_else(|| PathBuf::from("/"))
}

// ── Registry file ───────────────────────────────────────────────────────

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
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

fn registry_entry(path: &Path, agent_id: &str) -> Result<AcpAgentSpawn, String> {
    read_registry(path)
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry.get("id").and_then(Value::as_str) == Some(agent_id))
        .find_map(|entry| serde_json::from_value::<AcpAgentSpawn>(entry.clone()).ok())
        .ok_or_else(|| format!("no ACP agent {agent_id} in {}", path.display()))
}

// ── The live process ────────────────────────────────────────────────────

impl Live {
    fn emit(&self, event_type: &str, payload: Value) {
        (self.sink)(
            event_type,
            json!({
                "agent_id": self.agent_id,
                "type": event_type,
                "session_id": self.session_id.get().cloned().unwrap_or_default(),
                "payload": payload,
            }),
        );
    }

    async fn write(&self, msg: &Value) -> Result<(), String> {
        let mut line = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("the agent stopped reading: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("the agent stopped reading: {e}"))
    }

    async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.write(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
            .await
    }

    /// Send a request and return the receiver its reply lands on.
    async fn send_request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<oneshot::Receiver<Result<Value, String>>, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| "the reply table is poisoned".to_string())?
            .insert(id, tx);
        self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .await?;
        Ok(rx)
    }

    async fn request(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let rx = self.send_request(method, params).await?;
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(reply)) => reply,
            Ok(Err(_)) => Err(format!("{method}: the agent went away")),
            Err(_) => Err(format!("{method} timed out")),
        }
    }

    fn set_turn(&self, running: bool) -> bool {
        let mut guard = self.turn_running.lock().unwrap_or_else(|e| e.into_inner());
        let was = *guard;
        *guard = running;
        was
    }

    /// One line from the adapter: a reply to us, a request to us, or a
    /// streamed notification.
    fn on_line(self: &Arc<Self>, msg: Value) {
        let method = msg.get("method").and_then(Value::as_str);
        match (msg.get("id"), method) {
            (Some(id), None) => {
                let Some(id) = id.as_i64() else { return };
                let sender = self
                    .pending
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&id);
                if let Some(tx) = sender {
                    let reply = match msg.get("error") {
                        Some(err) => {
                            let message = text(err.get("message"));
                            Err(if message.trim().is_empty() {
                                "the agent refused the request".to_string()
                            } else {
                                message
                            })
                        }
                        None => Ok(msg.get("result").cloned().unwrap_or(Value::Null)),
                    };
                    let _ = tx.send(reply);
                }
            }
            (Some(id), Some(method)) => {
                self.on_agent_request(id.clone(), method, msg.get("params"))
            }
            (None, Some("session/update")) => {
                let Some(update) = msg.get("params").and_then(|p| p.get("update")) else {
                    return;
                };
                let translated = {
                    let mut tools = self.tool_started.lock().unwrap_or_else(|e| e.into_inner());
                    translate_update(update, &mut tools, Instant::now())
                };
                if let Some((event_type, payload)) = translated {
                    self.emit(event_type, payload);
                }
            }
            _ => {}
        }
    }

    fn on_agent_request(self: &Arc<Self>, rpc_id: Value, method: &str, params: Option<&Value>) {
        if method == "session/request_permission" {
            let request_id = format!("perm-{}", rpc_id);
            self.permissions
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(request_id.clone(), PendingPermission { rpc_id });
            self.emit(
                "approval.request",
                permission_payload(&request_id, params.unwrap_or(&Value::Null)),
            );
            return;
        }
        // fs/* and terminal/* were not offered in our capabilities; anything
        // else is an adapter extension we do not speak.
        let me = Arc::clone(self);
        let method = method.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = me
                .write(&json!({
                    "jsonrpc": "2.0",
                    "id": rpc_id,
                    "error": { "code": -32601, "message": format!("{method} is not supported by IntelliZen") },
                }))
                .await;
        });
    }

    async fn answer_permission(&self, request_id: &str, outcome: Value) -> Result<(), String> {
        let pending = self
            .permissions
            .lock()
            .map_err(|_| "the permission table is poisoned".to_string())?
            .remove(request_id)
            .ok_or_else(|| format!("no pending permission {request_id}"))?;
        self.write(&json!({
            "jsonrpc": "2.0",
            "id": pending.rpc_id,
            "result": { "outcome": outcome },
        }))
        .await
    }

    async fn cancel_pending_permissions(&self) {
        let ids: Vec<String> = self
            .permissions
            .lock()
            .map(|p| p.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            let _ = self
                .answer_permission(&id, json!({ "outcome": "cancelled" }))
                .await;
        }
    }

    fn kill(&self) {
        if let Some(reader) = self.reader.lock().unwrap_or_else(|e| e.into_inner()).take() {
            reader.abort();
        }
        if let Some(mut child) = self.child.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = child.start_kill();
        }
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
    }
}

fn stderr_excerpt(tail: &StderrTail) -> String {
    let lines = tail.lock().unwrap_or_else(|e| e.into_inner());
    lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}

/// Spawn the adapter and complete the handshake.
async fn connect(agent: &AcpAgentSpawn, sink: Sink) -> Result<Arc<Live>, String> {
    let binary = resolve_binary(&agent.command).ok_or_else(|| {
        format!(
            "{} is not installed (looked on PATH and in the usual bin folders)",
            agent.command
        )
    })?;
    let cwd = resolve_cwd(agent.cwd.as_deref());

    let mut child = Command::new(&binary)
        .args(&agent.args)
        .current_dir(&cwd)
        .env("PATH", child_path())
        .env("NO_COLOR", "1")
        // Claude Code refuses to nest inside a Claude Code shell; the app is
        // not one, whatever terminal launched it.
        .env_remove("CLAUDECODE")
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("could not start {}: {e}", binary.display()))?;

    let stdin = child.stdin.take().ok_or("no stdin on the agent process")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("no stdout on the agent process")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("no stderr on the agent process")?;
    let pid = child.id();

    let tail: StderrTail = Arc::new(StdMutex::new(VecDeque::new()));
    let tail_writer = Arc::clone(&tail);
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let mut tail = tail_writer.lock().unwrap_or_else(|e| e.into_inner());
            if tail.len() == STDERR_TAIL_LINES {
                tail.pop_front();
            }
            tail.push_back(line);
        }
    });

    let live = Arc::new(Live {
        agent_id: agent.id.clone(),
        session_id: OnceLock::new(),
        pid,
        child: StdMutex::new(Some(child)),
        stdin: Mutex::new(stdin),
        next_id: AtomicI64::new(1),
        pending: StdMutex::new(HashMap::new()),
        permissions: StdMutex::new(HashMap::new()),
        tool_started: StdMutex::new(HashMap::new()),
        turn_running: StdMutex::new(false),
        reader: StdMutex::new(None),
        sink,
    });

    // The reader must run before the first request or its reply is lost.
    let reader_live = Arc::clone(&live);
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            // A line we cannot parse is the adapter's problem, not ours.
            if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                reader_live.on_line(msg);
            }
        }
        // The process ended: fail every waiter so a turn cannot hang.
        let waiters: Vec<_> = reader_live
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain()
            .map(|(_, tx)| tx)
            .collect();
        for tx in waiters {
            let _ = tx.send(Err("the agent process exited".to_string()));
        }
    });
    *live.reader.lock().unwrap_or_else(|e| e.into_inner()) = Some(reader);

    let handshake = async {
        live.request(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false } },
            }),
            HANDSHAKE_TIMEOUT,
        )
        .await?;
        live.notify("initialized", json!({})).await?;
        let session = live
            .request(
                "session/new",
                json!({ "cwd": cwd.to_string_lossy(), "mcpServers": [] }),
                HANDSHAKE_TIMEOUT,
            )
            .await?;
        session
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "the agent created no session".to_string())
    };

    match handshake.await {
        Ok(session_id) => {
            let _ = live.session_id.set(session_id);
            Ok(live)
        }
        Err(reason) => {
            live.kill();
            let excerpt = stderr_excerpt(&tail);
            Err(if excerpt.is_empty() {
                reason
            } else {
                format!("{reason}\n{excerpt}")
            })
        }
    }
}

/// Run one turn to its end on a background task and report how it ended.
fn watch_turn(live: Arc<Live>, rx: oneshot::Receiver<Result<Value, String>>) {
    tauri::async_runtime::spawn(async move {
        let outcome = match tokio::time::timeout(TURN_TIMEOUT, rx).await {
            Ok(Ok(Ok(result))) => {
                let stop = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .unwrap_or("end_turn");
                if stop == "cancelled" {
                    json!({ "status": "interrupted" })
                } else {
                    json!({ "status": "complete", "stop_reason": stop })
                }
            }
            Ok(Ok(Err(reason))) => json!({ "status": "error", "error": reason }),
            Ok(Err(_)) => json!({ "status": "error", "error": "the agent went away" }),
            Err(_) => {
                let _ = live
                    .notify(
                        "session/cancel",
                        json!({ "sessionId": live.session_id.get().cloned().unwrap_or_default() }),
                    )
                    .await;
                json!({ "status": "error", "error": format!("The turn did not finish within {}s.", TURN_TIMEOUT.as_secs()) })
            }
        };
        live.cancel_pending_permissions().await;
        live.tool_started
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        live.set_turn(false);
        live.emit("message.complete", outcome);
    });
}

async fn prompt(live: &Arc<Live>, text: &str) -> Result<(), String> {
    if live.set_turn(true) {
        return Err("A turn is already running.".to_string());
    }
    let session_id = live.session_id.get().cloned().unwrap_or_default();
    let rx = match live
        .send_request(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": [{ "type": "text", "text": text }],
            }),
        )
        .await
    {
        Ok(rx) => rx,
        Err(reason) => {
            live.set_turn(false);
            return Err(reason);
        }
    };
    live.emit("message.start", json!({}));
    watch_turn(Arc::clone(live), rx);
    Ok(())
}

async fn cancel(live: &Arc<Live>) -> Result<(), String> {
    live.cancel_pending_permissions().await;
    let session_id = live.session_id.get().cloned().unwrap_or_default();
    live.notify("session/cancel", json!({ "sessionId": session_id }))
        .await
}

fn stop(agent_id: &str) {
    let removed = agents()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(agent_id);
    if let Some(live) = removed {
        live.kill();
        if live.set_turn(false) {
            live.emit("message.complete", json!({ "status": "interrupted" }));
        }
    }
}

pub fn shutdown() {
    let ids: Vec<String> = agents()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .keys()
        .cloned()
        .collect();
    for id in ids {
        stop(&id);
    }
}

fn app_sink(app: AppHandle) -> Sink {
    Arc::new(move |_event_type, envelope| {
        let _ = app.emit(EVENT_NAME, envelope);
    })
}

// ── Tauri commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn acp_start(
    app: AppHandle,
    agent_id: String,
    cwd: Option<String>,
) -> Result<AcpStarted, String> {
    if let Ok(existing) = live(&agent_id) {
        return Ok(AcpStarted {
            agent_id,
            session_id: existing.session_id.get().cloned().unwrap_or_default(),
            pid: existing.pid,
        });
    }
    let mut spec = registry_entry(&registry_path(&app)?, &agent_id)?;
    if cwd.as_deref().is_some_and(|path| !path.trim().is_empty()) {
        spec.cwd = cwd;
    }
    let ready = connect(&spec, app_sink(app)).await?;
    let started = AcpStarted {
        agent_id: agent_id.clone(),
        session_id: ready.session_id.get().cloned().unwrap_or_default(),
        pid: ready.pid,
    };
    agents()
        .lock()
        .map_err(|_| "the agent table is poisoned".to_string())?
        .insert(agent_id, ready);
    Ok(started)
}

#[tauri::command]
pub async fn acp_prompt(agent_id: String, text: String) -> Result<(), String> {
    prompt(&live(&agent_id)?, &text).await
}

#[tauri::command]
pub async fn acp_cancel(agent_id: String) -> Result<(), String> {
    cancel(&live(&agent_id)?).await
}

#[tauri::command]
pub async fn acp_stop(agent_id: String) -> Result<(), String> {
    stop(&agent_id);
    Ok(())
}

/// Read-only discovery for Settings. It uses the same Finder-safe PATH as
/// the spawner, so "available" means a chat can resolve the adapter too.
#[tauri::command]
pub fn acp_probe(commands: Vec<String>) -> Vec<AcpCommandProbe> {
    commands
        .into_iter()
        .map(|command| {
            let resolved = resolve_binary(&command);
            AcpCommandProbe {
                command,
                available: resolved.is_some(),
                path: resolved.map(|path| path.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn acp_respond_permission(
    agent_id: String,
    request_id: String,
    option_id: String,
) -> Result<(), String> {
    live(&agent_id)?
        .answer_permission(
            &request_id,
            json!({ "outcome": "selected", "optionId": option_id }),
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs::OpenOptions, io::Write, os::unix::fs::OpenOptionsExt, sync::Mutex as TestMutex};

    #[test]
    fn binaries_resolve_from_path_and_known_folders() {
        assert!(resolve_binary("ls").is_some());
        assert!(resolve_binary("/bin/ls").is_some());
        assert!(resolve_binary("definitely-not-a-binary-xyz").is_none());
        assert_eq!(expand_tilde("~/x"), home_dir().unwrap().join("x"));
        assert_eq!(resolve_cwd(Some("/nope/absent")), home_dir().unwrap());

        let probes = acp_probe(vec!["/bin/ls".into(), "/definitely/not/here".into()]);
        assert!(probes[0].available);
        assert!(!probes[1].available);
    }

    #[test]
    fn the_registry_entry_reads_and_tolerates_absence() {
        let dir = std::env::temp_dir().join(format!("acp-registry-{}", std::process::id()));
        let path = dir.join("nested").join(REGISTRY_FILE);
        assert_eq!(read_registry(&path), json!([]));
        let agents = json!([{ "id": "cc", "name": "Claude Code", "engine": "claude-code",
                              "command": "claude-agent-acp", "args": [], "avatar": "🤖" }]);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, serde_json::to_vec_pretty(&agents).unwrap()).unwrap();
        assert_eq!(read_registry(&path), agents);
        let spec = registry_entry(&path, "cc").unwrap();
        assert_eq!(spec.command, "claude-agent-acp");
        assert!(registry_entry(&path, "nope").is_err());
        let _ = fs::remove_dir_all(dir);
    }

    fn fake_agent(dir: &Path, body: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let path = dir.join("fake-acp.sh");
        let mut f = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o755)
            .open(&path)
            .unwrap();
        f.write_all(body.as_bytes()).unwrap();
        path
    }

    /// A shell agent that completes the handshake, streams one chunk, asks a
    /// permission, and ends the turn once the permission is answered.
    const FAKE_AGENT: &str = r#"#!/bin/bash
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*) echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}' ;;
    *'"method":"session/new"'*) echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"sess-1"}}' ;;
    *'"method":"session/prompt"'*)
      echo '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"pong"}}}}'
      echo '{"jsonrpc":"2.0","id":77,"method":"session/request_permission","params":{"sessionId":"sess-1","toolCall":{"toolCallId":"t1","title":"date","kind":"execute"},"options":[{"optionId":"ok","name":"Allow","kind":"allow_once"},{"optionId":"no","name":"Reject","kind":"reject_once"}]}}'
      ;;
    *'"id":77'*'"optionId":"ok"'*) echo '{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}' ;;
    *'"id":77'*) echo '{"jsonrpc":"2.0","id":3,"result":{"stopReason":"cancelled"}}' ;;
  esac
done
"#;

    #[tokio::test]
    async fn a_turn_streams_asks_permission_and_completes() {
        let dir = std::env::temp_dir().join(format!("acp-fake-{}", std::process::id()));
        let bin = fake_agent(&dir, FAKE_AGENT);
        let seen: Arc<TestMutex<Vec<Value>>> = Arc::new(TestMutex::new(Vec::new()));
        let sink_seen = Arc::clone(&seen);
        let sink: Sink = Arc::new(move |_, envelope| sink_seen.lock().unwrap().push(envelope));
        let spec = AcpAgentSpawn {
            id: "fake".into(),
            command: bin.to_string_lossy().into_owned(),
            args: vec![],
            cwd: Some(dir.to_string_lossy().into_owned()),
        };
        let live = connect(&spec, sink).await.expect("handshake");
        assert_eq!(live.session_id.get().map(String::as_str), Some("sess-1"));

        prompt(&live, "reply with pong").await.unwrap();
        assert!(prompt(&live, "again").await.is_err(), "one turn at a time");

        let wait_for = |needle: &'static str| {
            let seen = Arc::clone(&seen);
            async move {
                for _ in 0..200 {
                    if seen.lock().unwrap().iter().any(|e| e["type"] == needle) {
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(25)).await;
                }
                panic!("never saw {needle}: {:?}", seen.lock().unwrap());
            }
        };
        wait_for("approval.request").await;
        let request_id = {
            let seen = seen.lock().unwrap();
            let req = seen
                .iter()
                .find(|e| e["type"] == "approval.request")
                .unwrap();
            assert_eq!(req["session_id"], "sess-1");
            assert_eq!(req["agent_id"], "fake");
            assert_eq!(req["payload"]["choices"], json!(["once", "deny"]));
            req["payload"]["request_id"].as_str().unwrap().to_string()
        };
        live.answer_permission(
            &request_id,
            json!({ "outcome": "selected", "optionId": "ok" }),
        )
        .await
        .unwrap();
        wait_for("message.complete").await;

        let types: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|e| e["type"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            types,
            [
                "message.start",
                "message.delta",
                "approval.request",
                "message.complete"
            ]
        );
        let done = seen.lock().unwrap().last().cloned().unwrap();
        assert_eq!(done["payload"]["status"], "complete");
        assert!(!live.set_turn(false), "the turn flag is cleared");

        live.kill();
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_missing_binary_names_the_binary() {
        let sink: Sink = Arc::new(|_, _| {});
        let spec = AcpAgentSpawn {
            id: "x".into(),
            command: "/definitely/not/here".into(),
            args: vec![],
            cwd: None,
        };
        let err = connect(&spec, sink).await.err().unwrap();
        assert!(err.contains("/definitely/not/here"), "{err}");
    }

    #[tokio::test]
    async fn a_binary_that_never_answers_reports_its_stderr() {
        let dir = std::env::temp_dir().join(format!("acp-silent-{}", std::process::id()));
        let bin = fake_agent(&dir, "#!/bin/bash\necho 'not logged in' >&2\nexit 3\n");
        let sink: Sink = Arc::new(|_, _| {});
        let spec = AcpAgentSpawn {
            id: "silent".into(),
            command: bin.to_string_lossy().into_owned(),
            args: vec![],
            cwd: None,
        };
        let err = connect(&spec, sink).await.err().unwrap();
        assert!(err.contains("not logged in"), "{err}");
        let _ = fs::remove_dir_all(dir);
    }
}
