use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const STORE_VERSION: u32 = 1;
const STORE_FILE_NAME: &str = "runtime-bindings.json";
const CODEX_CONFIG_FILE_NAME: &str = "config.toml";
const WORKER_NODE_BINARY: &str = "/Users/adamking/.local/bin/node";
const INTELLIZEN_MCP_BUILD: &str =
    "/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js";
const ALLOWED_ADAPTERS: &[&str] = &["mock", "hermes", "codex-cli", "claude-cli", "gemini-cli"];

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

fn codex_worker_config() -> String {
    format!(
        r#"[mcp_servers.intelizen-worker]
command = "{WORKER_NODE_BINARY}"
args = [
  "{INTELLIZEN_MCP_BUILD}",
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
    if binding.adapter_id != "codex-cli" {
        return Err("Gate 3 profile preparation supports only codex-cli.".to_string());
    }
    let profile_path = PathBuf::from(&binding.worker_profile_home).join(CODEX_CONFIG_FILE_NAME);
    if confirm_write {
        canonical_existing_file(WORKER_NODE_BINARY, "worker node binary")?;
        canonical_existing_file(INTELLIZEN_MCP_BUILD, "IntelliZen MCP build")?;
        write_secure_text_atomic(&profile_path, &codex_worker_config())?;
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
    fn codex_worker_profile_contains_only_the_worker_mcp() {
        let config = codex_worker_config();
        assert!(config.contains("[mcp_servers.intelizen-worker]"));
        assert!(config.contains("--plane"));
        assert!(config.contains("\"worker\""));
        assert!(config.contains("INTELLIZEN_WORKER_CAPABILITY_URL"));
        assert!(config.contains("INTELLIZEN_WORKER_CAPABILITY_TOKEN"));
        assert!(!config.contains("supabase-genzen"));
        assert!(!config.contains("SERVICE_ROLE"));
        assert!(!config.contains("api_key"));
    }
}
