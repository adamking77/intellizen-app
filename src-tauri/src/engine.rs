//! The engine door. IntelliZen owns one `hermes serve`: it spawns it with a
//! token it chose, or attaches to a healthy loopback `hermes serve` (from its
//! own record or process discovery), and only ever kills what it spawned.

mod discovery;

use std::{
    collections::VecDeque,
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex as StdMutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
    task::JoinHandle,
};

use discovery::discover_running_engine;

const READY_TIMEOUT: Duration = Duration::from_secs(90);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(3);
/// A busy Hermes event loop can miss one probe; only two misses in a row count.
const HEALTH_RETRY_DELAY: Duration = Duration::from_secs(2);
const STOP_GRACE: Duration = Duration::from_secs(3);
const REAP_TIMEOUT: Duration = Duration::from_secs(2);
const STDERR_TAIL_LINES: usize = 20;
const RECORD_FILE: &str = "engine.json";
const SPAWNED_BY: &str = "intellizen";
const MODE_SPAWNED: &str = "spawned";
const MODE_ATTACHED: &str = "attached";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub mode: String,
    pub pid: u32,
    pub port: u16,
    pub token: String,
    pub version: String,
    pub url: String,
}

impl EngineInfo {
    fn new(mode: &str, pid: u32, port: u16, token: String, version: String) -> Self {
        Self {
            mode: mode.to_string(),
            pid,
            port,
            token,
            version,
            url: format!("http://127.0.0.1:{port}"),
        }
    }

    fn is_spawned(&self) -> bool {
        self.mode == MODE_SPAWNED
    }
}

/// What `engine.json` holds. `spawnedBy` marks a record this app wrote and
/// `processStart` pins the pid to one process lifetime; without both, a
/// recorded pid is never signalled.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct EngineRecord {
    pid: u32,
    port: u16,
    token: String,
    version: String,
    started_at: String,
    #[serde(default)]
    spawned_by: Option<String>,
    #[serde(default)]
    process_start: Option<String>,
}

impl EngineRecord {
    /// The start time we may kill this pid under, if the record is ours.
    fn owned_process_start(&self) -> Option<&str> {
        if self.spawned_by.as_deref() != Some(SPAWNED_BY) {
            return None;
        }
        self.process_start.as_deref().filter(|start| !start.is_empty())
    }
}

#[derive(Deserialize)]
struct HealthPayload {
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    version: String,
}

type StderrTail = Arc<StdMutex<VecDeque<String>>>;

#[derive(Default)]
struct Slot {
    child: Option<Child>,
    info: Option<EngineInfo>,
}

#[derive(Default)]
pub struct EngineState {
    /// Serialises boots: two windows starting at once spawn one engine.
    slot: Mutex<Slot>,
    /// Sync mirror of `slot.info` for the exit hook.
    current: StdMutex<Option<EngineInfo>>,
    /// A child that has been spawned but has not reported ready yet. The
    /// exit hook kills it; the slot only learns about it once it is ready.
    pending: AtomicU32,
}

impl EngineState {
    fn set_current(&self, info: Option<EngineInfo>) {
        if let Ok(mut current) = self.current.lock() {
            *current = info;
        }
    }

    fn current(&self) -> Option<EngineInfo> {
        self.current.lock().ok().and_then(|current| current.clone())
    }
}

static HTTP: OnceLock<Client> = OnceLock::new();

fn http() -> &'static Client {
    HTTP.get_or_init(|| {
        Client::builder()
            .no_proxy()
            .timeout(HEALTH_TIMEOUT)
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

fn hermes_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(home) = app.path().home_dir() {
        let local = home.join(".local/bin/hermes");
        if local.is_file() {
            return Ok(local);
        }
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join("hermes");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("Hermes is not installed".to_string())
}

fn record_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    Ok(dir.join(RECORD_FILE))
}

fn read_record(path: &Path) -> Option<EngineRecord> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Written owner-only through a temp file, then renamed into place: the
/// token inside is the gateway credential.
fn write_record(path: &Path, record: &EngineRecord) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(record).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&tmp)
        .map_err(|error| format!("Could not create {}: {error}", tmp.display()))?;
    file.write_all(&body)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Could not write {}: {error}", tmp.display()))?;
    drop(file);
    fs::rename(&tmp, path)
        .map_err(|error| format!("Could not move {} into place: {error}", tmp.display()))
}

fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    // SAFETY: signal 0 performs no action; it only checks that the pid exists
    // and that we may signal it.
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

fn ps_field(pid: u32, field: &str) -> Option<String> {
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", field])
        .output()
        .ok()?;
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn is_hermes_serve(pid: u32) -> bool {
    ps_field(pid, "command=")
        .map(|command| command.contains("hermes") && command.contains(" serve"))
        .unwrap_or(false)
}

/// Kernel start time of the process, as `ps` prints it. Two processes that
/// reuse a pid never share it.
fn process_start_of(pid: u32) -> Option<String> {
    ps_field(pid, "lstart=")
}

/// A recorded pid may be signalled only if it still is a `hermes serve` that
/// started when our record says it did.
fn may_signal_recorded(pid: u32, expected_start: &str) -> bool {
    pid != 0
        && is_hermes_serve(pid)
        && process_start_of(pid).as_deref() == Some(expected_start)
}

fn send_signal(pid: u32, sig: libc::c_int) {
    if pid == 0 {
        return;
    }
    // SAFETY: plain kill(2) on a pid the caller has verified it may signal.
    unsafe {
        libc::kill(pid as libc::pid_t, sig);
    }
}

fn has_exited(pid: u32, child: Option<&mut Child>) -> bool {
    match child {
        Some(child) => !matches!(child.try_wait(), Ok(None)),
        None => !pid_alive(pid),
    }
}

/// SIGTERM, a grace period, then SIGKILL. `child` is reaped when we hold it.
async fn stop_process(pid: u32, mut child: Option<Child>) {
    if has_exited(pid, child.as_mut()) {
        return;
    }
    send_signal(pid, libc::SIGTERM);
    let deadline = tokio::time::Instant::now() + STOP_GRACE;
    while tokio::time::Instant::now() < deadline {
        if has_exited(pid, child.as_mut()) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    send_signal(pid, libc::SIGKILL);
    if let Some(mut child) = child {
        let _ = tokio::time::timeout(REAP_TIMEOUT, child.wait()).await;
    }
}

/// Terminate a process this app spawned and still holds (or has not reaped):
/// its pid cannot have been reused, so no identity check is needed.
async fn terminate_held(pid: u32, child: Option<Child>) {
    stop_process(pid, child).await;
}

/// Terminate a process known only from `engine.json`. Refuses unless the pid
/// is still the same `hermes serve` the record describes.
async fn terminate_recorded(pid: u32, process_start: &str) {
    if !may_signal_recorded(pid, process_start) {
        return;
    }
    stop_process(pid, None).await;
}

/// [`terminate_held`] for the exit hook, which runs outside the runtime.
fn terminate_held_blocking(pid: u32, mut child: Option<Child>) {
    if has_exited(pid, child.as_mut()) {
        return;
    }
    send_signal(pid, libc::SIGTERM);
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        if has_exited(pid, child.as_mut()) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    send_signal(pid, libc::SIGKILL);
    if let Some(mut child) = child {
        let deadline = Instant::now() + REAP_TIMEOUT;
        while Instant::now() < deadline && matches!(child.try_wait(), Ok(None)) {
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

async fn kill_and_reap(child: &mut Child) {
    let _ = child.start_kill();
    let _ = tokio::time::timeout(REAP_TIMEOUT, child.wait()).await;
}

async fn health(port: u16) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{port}/api/health");
    let payload: HealthPayload = http()
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;
    if !payload.ok {
        return Err("/api/health reported ok=false".to_string());
    }
    Ok(payload.version)
}

/// One missed probe is not a dead engine: probe again after a pause and
/// only report failure when both miss.
async fn health_with_retry(port: u16) -> Result<String, String> {
    match health(port).await {
        Ok(version) => Ok(version),
        Err(first) => {
            tokio::time::sleep(HEALTH_RETRY_DELAY).await;
            health(port)
                .await
                .map_err(|second| format!("{first}; retry: {second}"))
        }
    }
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    fs::File::open("/dev/urandom")
        .and_then(|mut urandom| urandom.read_exact(&mut bytes))
        .map_err(|error| format!("Could not read /dev/urandom: {error}"))?;
    Ok(hex::encode(bytes))
}

fn parse_ready_port(line: &str) -> Option<u16> {
    let rest = line
        .strip_prefix("HERMES_BACKEND_READY port=")
        .or_else(|| line.strip_prefix("HERMES_DASHBOARD_READY port="))?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

fn stderr_excerpt(tail: &StderrTail) -> String {
    let lines = tail
        .lock()
        .map(|tail| tail.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    if lines.is_empty() {
        String::new()
    } else {
        format!("\n{}", lines.join("\n"))
    }
}

fn now_iso8601() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil-from-days (Howard Hinnant), proleptic Gregorian.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3_600,
        (rem % 3_600) / 60,
        rem % 60
    )
}

/// Is the engine we hold still alive and answering (two probes)?
async fn still_healthy(slot: &mut Slot, info: &EngineInfo) -> bool {
    let running = match slot.child.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => pid_alive(info.pid),
    };
    running && health_with_retry(info.port).await.is_ok()
}

/// What to do with the engine `engine.json` describes.
#[derive(Debug, PartialEq, Eq)]
enum Plan {
    /// Alive and answering: use it, never kill it.
    Attach(String),
    /// Alive, not answering, ours by record and start time: replace it.
    ReplaceOurs,
    /// Dead, or alive but not ours to touch: leave it and start our own.
    SpawnFresh,
}

fn decide(alive: bool, health: Result<String, String>, record: &EngineRecord) -> Plan {
    if !alive {
        return Plan::SpawnFresh;
    }
    match health {
        Ok(version) => Plan::Attach(version),
        Err(_) if record.owned_process_start().is_some() => Plan::ReplaceOurs,
        Err(_) => Plan::SpawnFresh,
    }
}

async fn plan_for(record: &EngineRecord) -> Plan {
    if !pid_alive(record.pid) {
        return Plan::SpawnFresh;
    }
    decide(true, health_with_retry(record.port).await, record)
}

#[derive(Debug)]
struct Spawned {
    info: EngineInfo,
    child: Child,
}

async fn spawn(
    binary: &Path,
    record_path: &Path,
    ready_timeout: Duration,
    pending: &AtomicU32,
) -> Result<Spawned, String> {
    let token = random_token()?;
    let mut command = Command::new(binary);
    command
        .args(["serve", "--host", "127.0.0.1", "--port", "0", "--skip-build"])
        .env("HERMES_DASHBOARD_SESSION_TOKEN", &token)
        // The gateway daemons already run the cron tick loop; a desktop-mode
        // backend would fire every job twice.
        .env_remove("HERMES_DESKTOP")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start {}: {error}", binary.display()))?;
    let pid = child
        .id()
        .ok_or_else(|| "Hermes exited before it reported a pid".to_string())?;
    // From here until the slot owns the child, the exit hook finds it here.
    pending.store(pid, Ordering::SeqCst);
    let result = wait_until_ready(child, pid, token, record_path, ready_timeout).await;
    pending.store(0, Ordering::SeqCst);
    result
}

/// After the child is gone its stderr reaches EOF; give the drain task a
/// moment to finish so the excerpt is complete.
async fn failure_message(tail: &StderrTail, stderr_task: JoinHandle<()>, message: String) -> String {
    let _ = tokio::time::timeout(Duration::from_millis(500), stderr_task).await;
    format!("{message}{}", stderr_excerpt(tail))
}

async fn wait_until_ready(
    mut child: Child,
    pid: u32,
    token: String,
    record_path: &Path,
    ready_timeout: Duration,
) -> Result<Spawned, String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Hermes stdout was not captured".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Hermes stderr was not captured".to_string())?;

    // Drain stderr for the life of the child so it never blocks on a full
    // pipe; keep the last lines for error reports.
    let tail: StderrTail = Arc::default();
    let tail_writer = Arc::clone(&tail);
    let stderr_task: JoinHandle<()> = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(mut tail) = tail_writer.lock() {
                if tail.len() == STDERR_TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line);
            }
        }
    });
    let mut lines = BufReader::new(stdout).lines();
    let deadline = tokio::time::Instant::now() + ready_timeout;
    let port = loop {
        match tokio::time::timeout_at(deadline, lines.next_line()).await {
            Ok(Ok(Some(line))) => {
                if let Some(port) = parse_ready_port(line.trim()) {
                    break port;
                }
            }
            Ok(Ok(None)) => {
                kill_and_reap(&mut child).await;
                return Err(failure_message(
                    &tail,
                    stderr_task,
                    "Hermes exited before it was ready.".to_string(),
                )
                .await);
            }
            Ok(Err(error)) => {
                kill_and_reap(&mut child).await;
                return Err(failure_message(
                    &tail,
                    stderr_task,
                    format!("Could not read Hermes output: {error}"),
                )
                .await);
            }
            Err(_) => {
                kill_and_reap(&mut child).await;
                return Err(failure_message(
                    &tail,
                    stderr_task,
                    format!(
                        "Hermes did not report ready within {} s.",
                        ready_timeout.as_secs()
                    ),
                )
                .await);
            }
        }
    };
    // Keep draining stdout too; nothing after the ready line matters.
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });

    let version = match health_with_retry(port).await {
        Ok(version) => version,
        Err(error) => {
            kill_and_reap(&mut child).await;
            return Err(failure_message(
                &tail,
                stderr_task,
                format!("Hermes came up on port {port} but /api/health failed: {error}"),
            )
            .await);
        }
    };

    let record = EngineRecord {
        pid,
        port,
        token: token.clone(),
        version: version.clone(),
        started_at: now_iso8601(),
        spawned_by: Some(SPAWNED_BY.to_string()),
        process_start: process_start_of(pid),
    };
    if let Err(error) = write_record(record_path, &record) {
        // Without the record a crash would leak the child; better not to run.
        kill_and_reap(&mut child).await;
        return Err(error);
    }

    Ok(Spawned {
        info: EngineInfo::new(MODE_SPAWNED, pid, port, token, version),
        child,
    })
}

#[tauri::command]
pub async fn engine_start(
    app: AppHandle,
    state: State<'_, EngineState>,
) -> Result<EngineInfo, String> {
    let mut slot = state.slot.lock().await;

    // Idempotent: a live engine we already hold is returned as is.
    if let Some(info) = slot.info.clone() {
        if still_healthy(&mut slot, &info).await {
            return Ok(info);
        }
        // It died or hung. A spawned child is killed and reaped; an attached
        // one is only forgotten here (the record decides its fate below).
        let child = slot.child.take();
        slot.info = None;
        state.set_current(None);
        if info.is_spawned() {
            terminate_held(info.pid, child).await;
        }
    }

    let record_path = record_path(&app)?;

    if let Some(record) = read_record(&record_path) {
        match plan_for(&record).await {
            Plan::Attach(version) => {
                let info = EngineInfo::new(
                    MODE_ATTACHED,
                    record.pid,
                    record.port,
                    record.token,
                    version,
                );
                slot.child = None;
                slot.info = Some(info.clone());
                state.set_current(Some(info.clone()));
                return Ok(info);
            }
            Plan::ReplaceOurs => {
                if let Some(start) = record.owned_process_start() {
                    terminate_recorded(record.pid, start).await;
                }
            }
            Plan::SpawnFresh => {}
        }
        let _ = fs::remove_file(&record_path);
    }

    if let Some(info) = discover_running_engine().await {
        slot.child = None;
        slot.info = Some(info.clone());
        state.set_current(Some(info.clone()));
        return Ok(info);
    }

    let binary = hermes_binary(&app)?;
    let spawned = spawn(&binary, &record_path, READY_TIMEOUT, &state.pending).await?;
    slot.child = Some(spawned.child);
    slot.info = Some(spawned.info.clone());
    state.set_current(Some(spawned.info.clone()));
    Ok(spawned.info)
}

/// Forget the current engine and its record. A spawned child is stopped; an
/// attached one is left running. The next `engine_start` spawns fresh.
async fn release(app: &AppHandle, state: &EngineState) -> Result<(), String> {
    let mut slot = state.slot.lock().await;
    let info = slot.info.take();
    let child = slot.child.take();
    state.set_current(None);
    if let Some(info) = info.as_ref().filter(|info| info.is_spawned()) {
        terminate_held(info.pid, child).await;
    }
    if let Ok(path) = record_path(app) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub async fn engine_stop(app: AppHandle, state: State<'_, EngineState>) -> Result<(), String> {
    release(&app, &state).await
}

/// Called by the window when an attached engine keeps refusing our token:
/// drop the record so the next start spawns an engine we hold the token for.
#[tauri::command]
pub async fn engine_reset(app: AppHandle, state: State<'_, EngineState>) -> Result<(), String> {
    release(&app, &state).await
}

/// App exit: kill a child we spawned (ready or still booting), never one we
/// attached to. If the app dies without reaching this, `engine.json` lets the
/// next launch attach.
pub fn shutdown(app: &AppHandle) {
    let Some(state) = app.try_state::<EngineState>() else {
        return;
    };
    let pending = state.pending.swap(0, Ordering::SeqCst);
    if pending != 0 {
        terminate_held_blocking(pending, None);
    }
    let Some(info) = state.current() else {
        return;
    };
    if !info.is_spawned() {
        return;
    }
    state.set_current(None);
    let child = state.slot.try_lock().ok().and_then(|mut slot| {
        slot.info = None;
        slot.child.take()
    });
    terminate_held_blocking(info.pid, child);
    if let Ok(path) = record_path(app) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, os::unix::fs::PermissionsExt};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "intellizen-engine-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    /// A stand-in `hermes` that ignores its arguments and runs `body`.
    fn fake_hermes(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("hermes");
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o755)
            .open(&path)
            .expect("script");
        file.write_all(format!("#!/bin/sh\n{body}\n").as_bytes())
            .expect("write script");
        path
    }

    /// Answers every request on a loopback port with a healthy payload.
    fn fake_health_server(version: &str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let body = format!(r#"{{"ok":true,"version":"{version}","auth_required":false}}"#);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    fn record(spawned_by: Option<&str>, process_start: Option<&str>) -> EngineRecord {
        EngineRecord {
            pid: 4242,
            port: 56083,
            token: "t".into(),
            version: "0.21.0".into(),
            started_at: "2026-09-02T09:00:00Z".into(),
            spawned_by: spawned_by.map(str::to_string),
            process_start: process_start.map(str::to_string),
        }
    }

    #[test]
    fn parses_the_ready_line_from_either_sentinel() {
        assert_eq!(parse_ready_port("HERMES_BACKEND_READY port=56083"), Some(56083));
        assert_eq!(parse_ready_port("HERMES_DASHBOARD_READY port=9119"), Some(9119));
        assert_eq!(parse_ready_port("HERMES_BACKEND_READY port=56083 extra"), Some(56083));
        assert_eq!(parse_ready_port("  Hermes backend listening on 127.0.0.1:56083"), None);
        assert_eq!(parse_ready_port("HERMES_BACKEND_READY port="), None);
    }

    #[test]
    fn engine_info_serialises_camel_case() {
        let info = EngineInfo::new(MODE_SPAWNED, 42, 56083, "t".into(), "0.21.0".into());
        let json = serde_json::to_value(&info).expect("serialise");
        assert_eq!(json["mode"], "spawned");
        assert_eq!(json["url"], "http://127.0.0.1:56083");
        assert_eq!(json["port"], 56083);
    }

    #[test]
    fn record_round_trips_and_tolerates_older_shapes() {
        let legacy: EngineRecord = serde_json::from_str(
            r#"{"pid":1,"port":2,"token":"t","version":"v","startedAt":"now"}"#,
        )
        .expect("parse");
        assert!(legacy.spawned_by.is_none());
        assert!(legacy.process_start.is_none());
        let ours = EngineRecord {
            spawned_by: Some(SPAWNED_BY.into()),
            process_start: Some("Wed Sep  2 13:58:09 2026".into()),
            ..legacy
        };
        let json = serde_json::to_string(&ours).expect("serialise");
        assert!(json.contains("\"spawnedBy\":\"intellizen\""));
        assert!(json.contains("\"processStart\":\"Wed Sep  2 13:58:09 2026\""));
        assert!(json.contains("\"startedAt\""));
        let back: EngineRecord = serde_json::from_str(&json).expect("reparse");
        assert_eq!(back, ours);
    }

    #[test]
    fn corrupt_or_partial_records_are_ignored() {
        let dir = temp_dir("corrupt");
        let path = dir.join(RECORD_FILE);
        fs::write(&path, "{not json").expect("write");
        assert!(read_record(&path).is_none());
        fs::write(&path, r#"{"pid":1}"#).expect("write");
        assert!(read_record(&path).is_none());
        fs::write(&path, "").expect("write");
        assert!(read_record(&path).is_none());
        assert!(read_record(&dir.join("missing.json")).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn records_are_written_owner_only() {
        let dir = temp_dir("mode");
        let path = dir.join(RECORD_FILE);
        write_record(&path, &record(Some(SPAWNED_BY), Some("x"))).expect("write");
        let mode = fs::metadata(&path).expect("meta").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "mode was {mode:o}");
        assert!(!path.with_extension("json.tmp").exists());
        assert_eq!(read_record(&path), Some(record(Some(SPAWNED_BY), Some("x"))));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn attach_versus_respawn_decision() {
        let ours = record(Some(SPAWNED_BY), Some("Wed Sep  2 13:58:09 2026"));
        let ours_without_start = record(Some(SPAWNED_BY), None);
        let theirs = record(None, Some("Wed Sep  2 13:58:09 2026"));

        assert_eq!(decide(false, Ok("0.21.0".into()), &ours), Plan::SpawnFresh);
        assert_eq!(decide(true, Ok("0.21.0".into()), &ours), Plan::Attach("0.21.0".into()));
        assert_eq!(decide(true, Ok("0.21.0".into()), &theirs), Plan::Attach("0.21.0".into()));
        assert_eq!(decide(true, Err("timeout".into()), &ours), Plan::ReplaceOurs);
        assert_eq!(decide(true, Err("timeout".into()), &ours_without_start), Plan::SpawnFresh);
        assert_eq!(decide(true, Err("timeout".into()), &theirs), Plan::SpawnFresh);
    }

    #[test]
    fn recorded_pids_need_matching_identity_before_a_signal() {
        let me = std::process::id();
        let start = process_start_of(me).expect("own start time");
        // Right start time, but this test binary is not a hermes serve.
        assert!(!may_signal_recorded(me, &start));
        assert!(!may_signal_recorded(me, "Thu Jan  1 00:00:00 1970"));
        assert!(!may_signal_recorded(0, &start));
    }

    #[test]
    fn iso8601_has_the_expected_shape() {
        let stamp = now_iso8601();
        assert_eq!(stamp.len(), 20, "{stamp}");
        assert!(stamp.ends_with('Z'));
        assert_eq!(&stamp[4..5], "-");
        assert_eq!(&stamp[10..11], "T");
    }

    #[test]
    fn dead_pid_is_not_alive() {
        assert!(!pid_alive(0));
        assert!(pid_alive(std::process::id()));
    }

    #[tokio::test]
    async fn spawn_succeeds_against_a_fake_hermes() {
        let dir = temp_dir("ok");
        let port = fake_health_server("9.9.9");
        let binary = fake_hermes(
            &dir,
            &format!(
                "echo \"HERMES_BACKEND_READY port={port}\"\ntrap 'kill $! 2>/dev/null; exit 0' TERM\nsleep 60 &\nwait $!"
            ),
        );
        let record_path = dir.join(RECORD_FILE);
        let pending = AtomicU32::new(0);

        let spawned = spawn(&binary, &record_path, Duration::from_secs(10), &pending)
            .await
            .expect("spawn");

        assert_eq!(spawned.info.mode, MODE_SPAWNED);
        assert_eq!(spawned.info.port, port);
        assert_eq!(spawned.info.version, "9.9.9");
        assert_eq!(spawned.info.url, format!("http://127.0.0.1:{port}"));
        assert_eq!(spawned.info.token.len(), 64);
        assert_eq!(pending.load(Ordering::SeqCst), 0, "pending cleared once ready");
        assert!(pid_alive(spawned.info.pid));

        let record = read_record(&record_path).expect("record written");
        assert_eq!(record.pid, spawned.info.pid);
        assert_eq!(record.port, port);
        assert_eq!(record.token, spawned.info.token);
        assert_eq!(record.spawned_by.as_deref(), Some(SPAWNED_BY));
        assert_eq!(record.process_start, process_start_of(spawned.info.pid));
        assert!(record.owned_process_start().is_some());
        let mode = fs::metadata(&record_path).expect("meta").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        let pid = spawned.info.pid;
        terminate_held(pid, Some(spawned.child)).await;
        assert!(!pid_alive(pid));
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn spawn_reports_an_immediate_death_with_stderr() {
        let dir = temp_dir("dies");
        let binary = fake_hermes(&dir, "echo 'boom: no such profile' >&2\nexit 3");
        let pending = AtomicU32::new(0);

        let error = spawn(&binary, &dir.join(RECORD_FILE), Duration::from_secs(10), &pending)
            .await
            .expect_err("must fail");

        assert!(error.contains("exited before it was ready"), "{error}");
        assert!(error.contains("boom: no such profile"), "{error}");
        assert_eq!(pending.load(Ordering::SeqCst), 0);
        assert!(!dir.join(RECORD_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn spawn_times_out_and_kills_a_silent_child() {
        let dir = temp_dir("silent");
        let binary = fake_hermes(&dir, "echo 'still warming up' >&2\nsleep 60");
        let record_path = dir.join(RECORD_FILE);
        let pending = Arc::new(AtomicU32::new(0));

        let task = {
            let pending = Arc::clone(&pending);
            tokio::spawn(async move {
                spawn(&binary, &record_path, Duration::from_secs(1), &pending).await
            })
        };
        tokio::time::sleep(Duration::from_millis(300)).await;
        let pid = pending.load(Ordering::SeqCst);
        assert_ne!(pid, 0, "pending pid is visible while booting");
        assert!(pid_alive(pid));

        let error = task.await.expect("join").expect_err("must time out");
        assert!(error.contains("did not report ready within 1 s"), "{error}");
        // The stderr excerpt is covered by the immediate-death test, where EOF
        // makes it deterministic; here a grandchild keeps the pipe open.
        assert_eq!(pending.load(Ordering::SeqCst), 0);
        assert!(!pid_alive(pid), "silent child was killed");
        assert!(!dir.join(RECORD_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn spawn_kills_a_child_whose_health_never_answers() {
        let dir = temp_dir("unhealthy");
        // Port 1 answers nothing; two probes fail, then the child must die.
        let binary = fake_hermes(
            &dir,
            "echo 'HERMES_BACKEND_READY port=1'\ntrap 'kill $! 2>/dev/null; exit 0' TERM\nsleep 60 &\nwait $!",
        );
        let pending = Arc::new(AtomicU32::new(0));
        let record_path = dir.join(RECORD_FILE);
        let task = {
            let pending = Arc::clone(&pending);
            tokio::spawn(async move {
                spawn(&binary, &record_path, Duration::from_secs(10), &pending).await
            })
        };
        tokio::time::sleep(Duration::from_millis(300)).await;
        let pid = pending.load(Ordering::SeqCst);
        assert_ne!(pid, 0);

        let error = task.await.expect("join").expect_err("must fail");
        assert!(error.contains("/api/health failed"), "{error}");
        assert!(error.contains("retry:"), "second probe was attempted: {error}");
        assert!(!pid_alive(pid));
        assert!(!dir.join(RECORD_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
