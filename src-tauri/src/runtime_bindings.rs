use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const STORE_VERSION: u32 = 1;
const STORE_FILE_NAME: &str = "runtime-bindings.json";
const CODEX_CONFIG_FILE_NAME: &str = "config.toml";
const CLAUDE_MCP_CONFIG_FILE_NAME: &str = "mcp-worker.json";
const WORKER_NODE_ENV: &str = "INTELLIZEN_WORKER_NODE_BINARY";
const INTELLIZEN_MCP_ENV: &str = "INTELLIZEN_MCP_BUILD";
const ALLOWED_ADAPTERS: &[&str] = &["codex-cli", "claude-cli"];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityEvidence {
    pub suite_version: String,
    pub passed: Vec<String>,
    pub cli_version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelPolicy {
    pub default: String,
    pub allowed: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBinding {
    pub binding_id: String,
    pub adapter_id: String,
    pub canonical_binary: String,
    pub arg_templates: Vec<String>,
    pub working_dir_grants: Vec<String>,
    pub provider_permission_mode: String,
    pub env_policy: String,
    pub worker_profile_home: String,
    #[serde(default)]
    pub secret_refs: Vec<String>,
    pub capability_evidence: CapabilityEvidence,
    pub model_policy: ModelPolicy,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBindingsStore {
    pub version: u32,
    pub bindings: Vec<RuntimeBinding>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkerRuntimeDependencies {
    node_binary: PathBuf,
    mcp_build: PathBuf,
}

impl Default for RuntimeBindingsStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            bindings: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBindingMutationResult {
    dry_run: bool,
    write_performed: bool,
    binding: RuntimeBinding,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProfileMutationResult {
    dry_run: bool,
    write_performed: bool,
    binding_id: String,
    profile_path: String,
}

fn runtime_config_root(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    Ok(home
        .join("Library")
        .join("Application Support")
        .join("IntelliZen"))
}

fn has_parent_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn canonical_existing_file(path: &str, label: &str) -> Result<PathBuf, String> {
    let raw = PathBuf::from(path);
    if !raw.is_absolute() || has_parent_component(&raw) {
        return Err(format!(
            "{label} must be an absolute path without parent traversal."
        ));
    }
    let canonical = fs::canonicalize(&raw)
        .map_err(|error| format!("{label} could not be resolved: {error}"))?;
    if !canonical.is_file() {
        return Err(format!("{label} must resolve to a file."));
    }
    Ok(canonical)
}

fn canonical_executable_file(path: &Path, label: &str) -> Result<PathBuf, String> {
    let canonical = canonical_existing_file(&path.to_string_lossy(), label)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&canonical)
            .map_err(|error| format!("{label} metadata could not be read: {error}"))?
            .permissions()
            .mode()
            & 0o111
            == 0
        {
            return Err(format!("{label} is not executable."));
        }
    }
    Ok(canonical)
}

fn canonical_existing_directory(path: &str, label: &str) -> Result<PathBuf, String> {
    let raw = PathBuf::from(path);
    if !raw.is_absolute() || has_parent_component(&raw) {
        return Err(format!(
            "{label} must be an absolute path without parent traversal."
        ));
    }
    let canonical = fs::canonicalize(&raw)
        .map_err(|error| format!("{label} could not be resolved: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("{label} must resolve to a directory."));
    }
    Ok(canonical)
}

fn validate_arg_templates(arguments: &[String]) -> Result<(), String> {
    for (index, argument) in arguments.iter().enumerate() {
        let normalized = argument.to_ascii_lowercase();
        let is_pinned_approval_policy =
            index > 0 && arguments[index - 1] == "-c" && argument == r#"approval_policy="never""#;
        if (argument.contains('=') && !is_pinned_approval_policy)
            || normalized.contains("api-key")
            || normalized.contains("access-token")
            || normalized.contains("auth-token")
            || normalized.contains("secret")
            || normalized.contains("password")
        {
            return Err(
                "Runtime argument templates cannot contain environment assignments or credential material."
                    .to_string(),
            );
        }
    }
    Ok(())
}

fn normalize_binding(
    mut binding: RuntimeBinding,
    config_root: &Path,
    create_worker_profile: bool,
) -> Result<RuntimeBinding, String> {
    if binding.binding_id.len() < 3
        || binding.binding_id.len() > 64
        || !binding.binding_id.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
        || !binding
            .binding_id
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
    {
        return Err(
            "bindingId must be 3-64 lowercase letters, numbers, dots, underscores, or hyphens."
                .to_string(),
        );
    }
    if !ALLOWED_ADAPTERS.contains(&binding.adapter_id.as_str()) {
        return Err(format!(
            "Unsupported runtime adapter: {}.",
            binding.adapter_id
        ));
    }
    if binding.env_policy != "sanitized" {
        return Err("Runtime bindings must use the sanitized environment policy.".to_string());
    }
    if binding.provider_permission_mode.trim().is_empty() {
        return Err("Runtime bindings require a provider permission mode.".to_string());
    }
    validate_arg_templates(&binding.arg_templates)?;

    let canonical_binary = canonical_existing_file(&binding.canonical_binary, "canonicalBinary")?;
    binding.canonical_binary = canonical_binary.to_string_lossy().into_owned();

    let mut grants = BTreeSet::new();
    for grant in &binding.working_dir_grants {
        grants.insert(
            canonical_existing_directory(grant, "workingDirGrant")?
                .to_string_lossy()
                .into_owned(),
        );
    }
    if grants.is_empty() {
        return Err("Runtime bindings require at least one working-directory grant.".to_string());
    }
    binding.working_dir_grants = grants.into_iter().collect();

    let worker_root = config_root.join("worker-profiles");
    let raw_worker_home = PathBuf::from(&binding.worker_profile_home);
    if !raw_worker_home.is_absolute()
        || has_parent_component(&raw_worker_home)
        || !raw_worker_home.starts_with(&worker_root)
    {
        return Err("workerProfileHome must be inside IntelliZen/worker-profiles.".to_string());
    }
    if create_worker_profile {
        fs::create_dir_all(&raw_worker_home)
            .map_err(|error| format!("Failed to create worker profile: {error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&worker_root, fs::Permissions::from_mode(0o700))
                .and_then(|_| {
                    fs::set_permissions(&raw_worker_home, fs::Permissions::from_mode(0o700))
                })
                .map_err(|error| format!("Failed to secure worker profile: {error}"))?;
        }
        let canonical_worker_root = fs::canonicalize(&worker_root)
            .map_err(|error| format!("Worker profile root could not be resolved: {error}"))?;
        let canonical_worker_home = fs::canonicalize(&raw_worker_home)
            .map_err(|error| format!("Worker profile home could not be resolved: {error}"))?;
        if !canonical_worker_home.starts_with(&canonical_worker_root) {
            return Err(
                "workerProfileHome resolves outside IntelliZen/worker-profiles.".to_string(),
            );
        }
        binding.worker_profile_home = canonical_worker_home.to_string_lossy().into_owned();
    } else if raw_worker_home.exists() {
        let canonical_worker_root = fs::canonicalize(&worker_root)
            .map_err(|error| format!("Worker profile root could not be resolved: {error}"))?;
        let canonical_worker_home = fs::canonicalize(&raw_worker_home)
            .map_err(|error| format!("Worker profile home could not be resolved: {error}"))?;
        if !canonical_worker_home.starts_with(&canonical_worker_root) {
            return Err(
                "workerProfileHome resolves outside IntelliZen/worker-profiles.".to_string(),
            );
        }
        binding.worker_profile_home = canonical_worker_home.to_string_lossy().into_owned();
    }

    if binding
        .secret_refs
        .iter()
        .any(|reference| !reference.starts_with("keyring://intellizen/") || reference.len() < 24)
    {
        return Err(
            "secretRefs may contain only opaque keyring://intellizen/... references.".to_string(),
        );
    }
    binding.secret_refs.sort();
    binding.secret_refs.dedup();

    if !binding.model_policy.allowed.is_empty()
        && !binding
            .model_policy
            .allowed
            .contains(&binding.model_policy.default)
    {
        return Err("The default model must appear in modelPolicy.allowed.".to_string());
    }
    binding.model_policy.allowed.sort();
    binding.model_policy.allowed.dedup();
    binding.capability_evidence.passed.sort();
    binding.capability_evidence.passed.dedup();

    Ok(binding)
}

fn read_store(path: &Path) -> Result<RuntimeBindingsStore, String> {
    if !path.exists() {
        return Ok(RuntimeBindingsStore::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read runtime bindings: {error}"))?;
    let store: RuntimeBindingsStore = serde_json::from_str(&contents)
        .map_err(|error| format!("Invalid runtime bindings file: {error}"))?;
    if store.version != STORE_VERSION {
        return Err(format!(
            "Unsupported runtime bindings version {}.",
            store.version
        ));
    }
    Ok(store)
}

fn write_store_atomic(path: &Path, store: &RuntimeBindingsStore) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Runtime bindings path has no parent.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create runtime config directory: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Failed to secure runtime config directory: {error}"))?;
    }

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temporary = parent.join(format!(
        ".{STORE_FILE_NAME}.{}.{}.tmp",
        std::process::id(),
        nonce
    ));
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("Failed to serialize runtime bindings: {error}"))?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| format!("Failed to create temporary runtime bindings file: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Failed to persist runtime bindings: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Failed to commit runtime bindings atomically: {error}"))?;
    Ok(())
}

fn configured_dependency(
    variable: &str,
    label: &str,
    read_env: &dyn Fn(&str) -> Option<String>,
    executable: bool,
) -> Result<Option<PathBuf>, String> {
    let Some(value) = read_env(variable) else {
        return Ok(None);
    };
    if value.trim().is_empty() {
        return Err(format!(
            "{variable} is set but empty. Set it to an absolute {label} path or remove it."
        ));
    }
    let resolved = if executable {
        canonical_executable_file(Path::new(&value), label)
    } else {
        canonical_existing_file(&value, label)
    }
    .map_err(|error| format!("{variable} is invalid: {error}"))?;
    Ok(Some(resolved))
}

fn resolve_worker_runtime_dependencies_with(
    binding: &RuntimeBinding,
    read_env: &dyn Fn(&str) -> Option<String>,
    current_dir: Option<&Path>,
    current_exe: Option<&Path>,
) -> Result<WorkerRuntimeDependencies, String> {
    let node_binary = if let Some(configured) =
        configured_dependency(WORKER_NODE_ENV, "worker Node.js binary", read_env, true)?
    {
        configured
    } else {
        let mut candidates = Vec::new();
        if let Some(path) = read_env("PATH") {
            candidates.extend(env::split_paths(&path).map(|root| root.join("node")));
        }
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/usr/bin/node"),
        ]);
        candidates
            .iter()
            .find_map(|candidate| canonical_executable_file(candidate, "worker Node.js binary").ok())
            .ok_or_else(|| {
                format!(
                    "Worker Node.js binary was not found. Install Node.js or set {WORKER_NODE_ENV} to its absolute executable path."
                )
            })?
    };

    let mcp_build = if let Some(configured) =
        configured_dependency(INTELLIZEN_MCP_ENV, "IntelliZen MCP build", read_env, false)?
    {
        configured
    } else {
        let mut roots = BTreeSet::new();
        for grant in &binding.working_dir_grants {
            roots.insert(PathBuf::from(grant));
        }
        if let Some(directory) = current_dir {
            roots.insert(directory.to_path_buf());
        }
        if let Some(executable) = current_exe {
            if let Some(parent) = executable.parent() {
                roots.insert(parent.to_path_buf());
            }
        }
        roots
            .iter()
            .map(|root| root.join("mcp-server").join("dist").join("index.js"))
            .find_map(|candidate| {
                canonical_existing_file(&candidate.to_string_lossy(), "IntelliZen MCP build").ok()
            })
            .ok_or_else(|| {
                format!(
                    "IntelliZen worker MCP build was not found in any reviewed working-directory grant or application path. Run `pnpm --dir mcp-server build` in the IntelliZen checkout, or set {INTELLIZEN_MCP_ENV} to the absolute dist/index.js path."
                )
            })?
    };

    Ok(WorkerRuntimeDependencies {
        node_binary,
        mcp_build,
    })
}

fn resolve_worker_runtime_dependencies(
    binding: &RuntimeBinding,
) -> Result<WorkerRuntimeDependencies, String> {
    let current_dir = env::current_dir().ok();
    let current_exe = env::current_exe().ok();
    resolve_worker_runtime_dependencies_with(
        binding,
        &|key| env::var(key).ok(),
        current_dir.as_deref(),
        current_exe.as_deref(),
    )
}

fn json_string(path: &Path) -> String {
    serde_json::to_string(&path.to_string_lossy()).expect("path string is serializable")
}

fn codex_worker_config(dependencies: &WorkerRuntimeDependencies) -> String {
    let node_binary = json_string(&dependencies.node_binary);
    let mcp_build = json_string(&dependencies.mcp_build);
    format!(
        r#"[mcp_servers.intelizen-worker]
command = {node_binary}
args = [
  {mcp_build},
  "--plane",
  "worker",
]
env_vars = [
  "INTELLIZEN_WORKER_CAPABILITY_URL",
  "INTELLIZEN_WORKER_CAPABILITY_TOKEN",
]
default_tools_approval_mode = "approve"
enabled_tools = [
  "advance_workflow_step",
  "append_agent_work_note",
  "list_agent_projects",
  "list_agent_work",
  "list_databases",
  "list_role_assignments",
  "list_roles",
  "list_workflow_runs",
  "list_workflows",
  "query_records",
  "report_verification",
]
"#
    )
}

fn claude_worker_config(dependencies: &WorkerRuntimeDependencies) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "mcpServers": {
            "intelizen-worker": {
                "type": "stdio",
                "command": dependencies.node_binary,
                "args": [
                    dependencies.mcp_build,
                    "--plane",
                    "worker"
                ]
            }
        }
    }))
    .expect("static Claude worker config is serializable")
}

fn write_secure_text_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Runtime profile path has no parent.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create runtime profile directory: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Failed to secure runtime profile directory: {error}"))?;
    }
    let temporary = parent.join(format!(
        ".{CODEX_CONFIG_FILE_NAME}.{}.tmp",
        std::process::id()
    ));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| format!("Failed to create runtime profile: {error}"))?;
    file.write_all(contents.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Failed to persist runtime profile: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Failed to commit runtime profile atomically: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn runtime_bindings_list(app: AppHandle) -> Result<RuntimeBindingsStore, String> {
    read_store(&runtime_config_root(&app)?.join(STORE_FILE_NAME))
}

#[tauri::command]
pub fn runtime_bindings_upsert(
    app: AppHandle,
    binding: RuntimeBinding,
    confirm_write: bool,
) -> Result<RuntimeBindingMutationResult, String> {
    let root = runtime_config_root(&app)?;
    let binding = normalize_binding(binding, &root, confirm_write)?;
    resolve_worker_runtime_dependencies(&binding)?;
    if !confirm_write {
        return Ok(RuntimeBindingMutationResult {
            dry_run: true,
            write_performed: false,
            binding,
        });
    }

    let path = root.join(STORE_FILE_NAME);
    let mut store = read_store(&path)?;
    store
        .bindings
        .retain(|existing| existing.binding_id != binding.binding_id);
    store.bindings.push(binding.clone());
    store
        .bindings
        .sort_by(|left, right| left.binding_id.cmp(&right.binding_id));
    write_store_atomic(&path, &store)?;

    Ok(RuntimeBindingMutationResult {
        dry_run: false,
        write_performed: true,
        binding,
    })
}

#[tauri::command]
pub fn runtime_binding_prepare_worker_profile(
    app: AppHandle,
    binding_id: String,
    confirm_write: bool,
) -> Result<RuntimeProfileMutationResult, String> {
    let root = runtime_config_root(&app)?;
    let store = read_store(&root.join(STORE_FILE_NAME))?;
    let binding = store
        .bindings
        .iter()
        .find(|binding| binding.binding_id == binding_id)
        .cloned()
        .ok_or_else(|| format!("Runtime binding {binding_id} was not found."))?;
    let binding = normalize_binding(binding, &root, false)?;
    let dependencies = resolve_worker_runtime_dependencies(&binding)?;
    let (profile_path, contents) = match binding.adapter_id.as_str() {
        "codex-cli" => (
            PathBuf::from(&binding.worker_profile_home).join(CODEX_CONFIG_FILE_NAME),
            codex_worker_config(&dependencies),
        ),
        "claude-cli" => (
            PathBuf::from(&binding.worker_profile_home).join(CLAUDE_MCP_CONFIG_FILE_NAME),
            claude_worker_config(&dependencies),
        ),
        _ => {
            return Err("Worker profile preparation supports codex-cli and claude-cli.".to_string())
        }
    };
    if confirm_write {
        write_secure_text_atomic(&profile_path, &contents)?;
    }
    Ok(RuntimeProfileMutationResult {
        dry_run: !confirm_write,
        write_performed: confirm_write,
        binding_id,
        profile_path: profile_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "intellizen-runtime-bindings-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn fixture(root: &Path) -> RuntimeBinding {
        let binary = root.join("bin").join("codex");
        let grant = root.join("work");
        let worker = root.join("worker-profiles").join("codex-keel");
        fs::create_dir_all(binary.parent().expect("binary parent")).expect("bin directory");
        fs::create_dir_all(&grant).expect("grant directory");
        fs::create_dir_all(&worker).expect("worker directory");
        fs::write(&binary, b"fixture").expect("binary fixture");

        RuntimeBinding {
            binding_id: "codex-local-primary".to_string(),
            adapter_id: "codex-cli".to_string(),
            canonical_binary: binary.to_string_lossy().into_owned(),
            arg_templates: vec![
                "exec".to_string(),
                "--json".to_string(),
                "--sandbox".to_string(),
                "workspace-write".to_string(),
                "-c".to_string(),
                r#"approval_policy="never""#.to_string(),
            ],
            working_dir_grants: vec![grant.to_string_lossy().into_owned()],
            provider_permission_mode: "workspace-write".to_string(),
            env_policy: "sanitized".to_string(),
            worker_profile_home: worker.to_string_lossy().into_owned(),
            secret_refs: vec!["keyring://intellizen/codex-local-primary".to_string()],
            capability_evidence: CapabilityEvidence {
                suite_version: "gate1".to_string(),
                passed: vec!["stream".to_string()],
                cli_version: "0.145.0".to_string(),
            },
            model_policy: ModelPolicy {
                default: "gpt-5.3-codex".to_string(),
                allowed: vec!["gpt-5.3-codex".to_string()],
            },
        }
    }

    fn executable_fixture(path: &Path) {
        fs::create_dir_all(path.parent().expect("fixture parent")).expect("fixture directory");
        fs::write(path, b"fixture").expect("fixture file");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o700))
                .expect("fixture executable");
        }
    }

    fn dependency_fixture(root: &Path) -> WorkerRuntimeDependencies {
        let node = root.join("bin").join("node");
        let mcp = root.join("mcp-server").join("dist").join("index.js");
        executable_fixture(&node);
        fs::create_dir_all(mcp.parent().expect("MCP parent")).expect("MCP directory");
        fs::write(&mcp, b"fixture").expect("MCP fixture");
        WorkerRuntimeDependencies {
            node_binary: fs::canonicalize(node).expect("canonical node"),
            mcp_build: fs::canonicalize(mcp).expect("canonical MCP"),
        }
    }

    #[test]
    fn normalizes_existing_paths_and_keyring_references() {
        let root = test_root("normalize");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let normalized = normalize_binding(fixture(&root), &root, false).expect("normalize");
        assert!(Path::new(&normalized.canonical_binary).is_absolute());
        assert!(Path::new(&normalized.working_dir_grants[0]).is_absolute());
        assert_eq!(
            normalized.secret_refs,
            vec!["keyring://intellizen/codex-local-primary"]
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn dry_run_validates_without_creating_worker_profile() {
        let root = test_root("dry-run");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let binding = fixture(&root);
        let worker_home = PathBuf::from(&binding.worker_profile_home);
        fs::remove_dir_all(&worker_home).expect("remove fixture worker");

        let normalized = normalize_binding(binding, &root, false).expect("dry-run normalize");
        assert_eq!(PathBuf::from(normalized.worker_profile_home), worker_home);
        assert!(!worker_home.exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_secret_values_and_credential_arguments() {
        let root = test_root("secret");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let mut binding = fixture(&root);
        binding.secret_refs = vec!["actual-secret-value".to_string()];
        assert!(normalize_binding(binding, &root, false)
            .expect_err("secret ref should fail")
            .contains("keyring://intellizen"));

        let mut binding = fixture(&root);
        binding.arg_templates.push("--api-key".to_string());
        assert!(normalize_binding(binding, &root, false)
            .expect_err("credential arg should fail")
            .contains("credential material"));

        let mut binding = fixture(&root);
        binding.arg_templates.push("TOKEN=value".to_string());
        assert!(normalize_binding(binding, &root, false)
            .expect_err("environment assignment should fail")
            .contains("credential material"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn writes_and_reads_versioned_store_atomically() {
        let root = test_root("store");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let binding = normalize_binding(fixture(&root), &root, false).expect("normalize");
        let path = root.join(STORE_FILE_NAME);
        let store = RuntimeBindingsStore {
            version: STORE_VERSION,
            bindings: vec![binding],
        };
        write_store_atomic(&path, &store).expect("write");
        assert_eq!(read_store(&path).expect("read"), store);

        let contents = fs::read_to_string(&path).expect("contents");
        assert!(!contents.contains("actual-secret-value"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).expect("metadata").permissions().mode() & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn discovers_worker_dependencies_from_path_and_reviewed_grant() {
        let root = test_root("dependency-discovery");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let dependencies = dependency_fixture(&root);
        let mut binding = fixture(&root);
        binding.working_dir_grants = vec![root.to_string_lossy().into_owned()];
        let path = dependencies
            .node_binary
            .parent()
            .expect("node parent")
            .to_string_lossy()
            .into_owned();
        let resolved = resolve_worker_runtime_dependencies_with(
            &binding,
            &|key| (key == "PATH").then(|| path.clone()),
            None,
            None,
        )
        .expect("discover dependencies");
        assert_eq!(resolved, dependencies);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn explicit_worker_dependency_configuration_is_validated_without_fallback() {
        let root = test_root("dependency-config");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let dependencies = dependency_fixture(&root);
        let binding = fixture(&root);
        let read_env = |key: &str| match key {
            WORKER_NODE_ENV => Some(dependencies.node_binary.to_string_lossy().into_owned()),
            INTELLIZEN_MCP_ENV => Some(dependencies.mcp_build.to_string_lossy().into_owned()),
            _ => None,
        };
        assert_eq!(
            resolve_worker_runtime_dependencies_with(&binding, &read_env, None, None)
                .expect("configured dependencies"),
            dependencies
        );

        let invalid = |key: &str| match key {
            WORKER_NODE_ENV => Some(root.join("missing-node").to_string_lossy().into_owned()),
            "PATH" => Some(
                dependencies
                    .node_binary
                    .parent()
                    .expect("node parent")
                    .to_string_lossy()
                    .into_owned(),
            ),
            _ => None,
        };
        let error = resolve_worker_runtime_dependencies_with(&binding, &invalid, None, None)
            .expect_err("invalid explicit path");
        assert!(error.contains(WORKER_NODE_ENV));
        assert!(error.contains("could not be resolved"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn missing_worker_dependencies_fail_with_actionable_configuration() {
        let root = test_root("dependency-missing");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let mut binding = fixture(&root);
        binding.working_dir_grants = vec![root.join("work").to_string_lossy().into_owned()];
        let error = resolve_worker_runtime_dependencies_with(
            &binding,
            &|_| None,
            Some(&root.join("elsewhere")),
            None,
        )
        .expect_err("dependencies should be missing");
        assert!(
            error.contains(WORKER_NODE_ENV) || error.contains(INTELLIZEN_MCP_ENV),
            "{error}"
        );
        assert!(error.contains("not found"), "{error}");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn mcp_discovery_does_not_escape_above_the_reviewed_grant() {
        let root = test_root("dependency-grant-boundary");
        fs::create_dir_all(root.join("worker-profiles")).expect("worker root");
        let dependencies = dependency_fixture(&root);
        let mut binding = fixture(&root);
        binding.working_dir_grants = vec![root.join("work").to_string_lossy().into_owned()];
        let node_path = dependencies
            .node_binary
            .parent()
            .expect("node parent")
            .to_string_lossy()
            .into_owned();
        let error = resolve_worker_runtime_dependencies_with(
            &binding,
            &|key| (key == "PATH").then(|| node_path.clone()),
            None,
            None,
        )
        .expect_err("parent MCP build must not be selected");
        assert!(error.contains(INTELLIZEN_MCP_ENV), "{error}");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn codex_worker_profile_contains_only_the_worker_mcp() {
        let root = test_root("codex-profile");
        let dependencies = dependency_fixture(&root);
        let config = codex_worker_config(&dependencies);
        assert!(config.contains("[mcp_servers.intelizen-worker]"));
        assert!(config.contains("--plane"));
        assert!(config.contains("\"worker\""));
        assert!(config.contains(&dependencies.node_binary.to_string_lossy().into_owned()));
        assert!(config.contains(&dependencies.mcp_build.to_string_lossy().into_owned()));
        assert!(config.contains("INTELLIZEN_WORKER_CAPABILITY_URL"));
        assert!(config.contains("INTELLIZEN_WORKER_CAPABILITY_TOKEN"));
        assert!(!config.contains("supabase-genzen"));
        assert!(!config.contains("SERVICE_ROLE"));
        assert!(!config.contains("api_key"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn claude_worker_profile_contains_only_the_worker_mcp() {
        let root = test_root("claude-profile");
        let dependencies = dependency_fixture(&root);
        let config = claude_worker_config(&dependencies);
        let parsed: serde_json::Value = serde_json::from_str(&config).expect("valid json");
        let servers = parsed["mcpServers"].as_object().expect("mcp servers");
        assert_eq!(servers.keys().collect::<Vec<_>>(), vec!["intelizen-worker"]);
        assert_eq!(
            parsed["mcpServers"]["intelizen-worker"]["command"],
            dependencies.node_binary.to_string_lossy().as_ref()
        );
        assert_eq!(
            parsed["mcpServers"]["intelizen-worker"]["args"],
            serde_json::json!([dependencies.mcp_build, "--plane", "worker"])
        );
        assert!(!config.contains("supabase-genzen"));
        assert!(!config.contains("SERVICE_ROLE"));
        assert!(!config.contains("api_key"));
        fs::remove_dir_all(root).expect("cleanup");
    }
}
