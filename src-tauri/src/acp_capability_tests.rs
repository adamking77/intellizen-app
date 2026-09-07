//! Verify restrictions on the actual spawn/JSON-RPC path, using a local fake adapter.
use super::*;
use crate::cli_capability_policy::{
    restrictions, verify_workflow_read_only_adapter, workflow_read_only_restrictions, Selection,
};
use std::fs;
use std::os::unix::fs::symlink;

#[tokio::test]
async fn workflow_mode_must_be_confirmed_before_prompting() {
    for (name, response) in [
        (
            "wrong",
            json!({"configOptions":[{"id":"mode","currentValue":"auto"}]}),
        ),
        ("missing", json!({})),
    ] {
        let dir = std::env::temp_dir().join(format!("acp-mode-{name}-{}", std::process::id()));
        let script = tests::FAKE_AGENT.replace(
            "  case \"$line\" in",
            &format!("  printf '%s\\n' \"$line\" >> wire.txt\n  case \"$line\" in\n    *'\"method\":\"session/set_config_option\"'*) echo '{}' ;;", json!({"jsonrpc":"2.0","id":3,"result":response})),
        );
        let bin = tests::fake_agent(&dir, &script);
        let spec = AcpAgentSpawn {
            id: name.into(),
            engine: "codex".into(),
            command: bin.to_string_lossy().into_owned(),
            args: vec![],
            cwd: Some(dir.to_string_lossy().into_owned()),
            model: None,
            identity: None,
            context: vec![],
        };
        let restrictions = workflow_read_only_restrictions("codex", &dir, &dir, &[]).unwrap();
        let result = connect(&spec, Arc::new(|_, _| {}), name.into(), &restrictions).await;
        assert!(result
            .err()
            .unwrap()
            .contains("did not confirm required session mode read-only"));
        assert!(!fs::read_to_string(dir.join("wire.txt"))
            .unwrap()
            .contains("session/prompt"));
        let _ = fs::remove_dir_all(dir);
    }
}

#[tokio::test]
#[ignore = "requires the installed logged-in Codex ACP adapter; no model prompt is sent"]
async fn installed_codex_confirms_read_only_mode() {
    let dir = std::env::temp_dir().join(format!("acp-mode-live-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let registry = home_dir()
        .unwrap()
        .join("Library/Application Support/com.genzen.intellizen/acp-agents.json");
    let mut spec =
        crate::acp_config::registry_entry(&registry, "keel").expect("registered keel ACP agent");
    spec.cwd = Some(dir.to_string_lossy().into_owned());
    verify_workflow_read_only_adapter(&spec).unwrap();
    let restrictions =
        workflow_read_only_restrictions("codex", &home_dir().unwrap(), &dir, &[]).unwrap();
    let live = connect(
        &spec,
        Arc::new(|_, _| {}),
        "mode-proof".into(),
        &restrictions,
    )
    .await
    .expect("installed Codex read-only handshake");
    assert_eq!(
        live.options.lock().unwrap().permission_mode.as_deref(),
        Some("read-only")
    );
    live.kill();
    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn capability_choices_reach_new_adapter_sessions() {
    for engine in ["codex", "claude-code"] {
        let dir = std::env::temp_dir().join(format!("acp-policy-{engine}-{}", std::process::id()));
        let script = tests::FAKE_AGENT
            .replace("while IFS=", "printf '%s\\n' \"$@\" > argv.txt\nwhile IFS=")
            .replace(
                "  case \"$line\" in",
                "  printf '%s\\n' \"$line\" >> wire.txt\n  case \"$line\" in",
            );
        let bin = tests::fake_agent(&dir, &script);
        let spec = AcpAgentSpawn {
            id: "policy".into(),
            engine: engine.into(),
            command: bin.to_string_lossy().into_owned(),
            args: vec![],
            cwd: Some(dir.to_string_lossy().into_owned()),
            model: None,
            identity: None,
            context: vec![],
        };
        let restrictions = restrictions(
            engine,
            &dir,
            &[Selection {
                provider: engine.into(),
                kind: "connection".into(),
                name: "intelizen".into(),
                enabled: false,
            }],
        )
        .unwrap();
        let live = connect(
            &spec,
            Arc::new(|_, _| {}),
            format!("policy-{engine}"),
            &restrictions,
        )
        .await
        .unwrap();
        let wire = fs::read_to_string(dir.join("wire.txt")).unwrap();
        let initialize: Value = wire
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .find(|message| message["method"] == "initialize")
            .unwrap();
        assert_eq!(
            initialize["params"]["clientCapabilities"]["_meta"]["jetbrains"]["air"],
            json!({ "version": 1, "capabilities": ["sessionFailure"] })
        );
        let new_session: Value = wire
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .find(|message| message["method"] == "session/new")
            .unwrap();
        assert_eq!(new_session["params"]["mcpServers"], json!([]));
        if engine == "codex" {
            let argv = fs::read_to_string(dir.join("argv.txt")).unwrap();
            let flag = argv
                .lines()
                .find(|line| line.starts_with("mcp_servers="))
                .unwrap();
            let parsed = flag.parse::<toml::Table>().unwrap();
            assert_eq!(
                parsed["mcp_servers"]["intelizen"]["enabled"].as_bool(),
                Some(false)
            );
        } else {
            assert_eq!(
                new_session["params"]["_meta"]["claudeCode"]["options"]["disallowedTools"],
                json!(["mcp__intelizen__*"])
            );
        }
        live.kill();
        let _ = fs::remove_dir_all(dir);
    }
}

#[test]
fn terminal_air_session_failure_is_not_reported_as_complete() {
    let failure = json!({
        "stopReason": "end_turn",
        "_meta": { "jetbrains": { "air": {
            "version": 1,
            "sessionFailure": {
                "id": "turn:error", "revision": 1, "category": "provider_error",
                "severity": "error", "title": "HTTP 400: update Codex", "actions": []
            }
        } } }
    });
    assert_eq!(
        turn_outcome(&failure),
        json!({
            "status": "error", "error": "HTTP 400: update Codex"
        })
    );
    assert_eq!(
        turn_outcome(&json!({ "stopReason": "end_turn" })),
        json!({
            "status": "complete", "stop_reason": "end_turn"
        })
    );
}

#[tokio::test]
async fn workflow_read_only_reaches_the_codex_process_and_removes_all_mcp() {
    let dir = std::env::temp_dir().join(format!("acp-read-only-{}", std::process::id()));
    fs::create_dir_all(dir.join(".codex")).unwrap();
    fs::write(
        dir.join(".codex/config.toml"),
        "[plugins.home_writer]\nenabled=true\n[mcp_servers.home_remote]\nenabled=true\n",
    )
    .unwrap();
    let project = dir.join("project/subdir");
    fs::create_dir_all(project.join(".codex")).unwrap();
    fs::write(
        project.join(".codex/config.toml"),
        "[plugins.project_writer]\nenabled=true\n[mcp_servers.project_remote]\nenabled=true\n",
    )
    .unwrap();
    let script = tests::FAKE_AGENT
        .replace(
            "*'\"method\":\"session/new\"'*) echo '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"sessionId\":\"sess-1\"}}' ;;",
            "*'\"method\":\"session/new\"'*) echo '{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"sessionId\":\"sess-1\",\"configOptions\":[{\"id\":\"mode\",\"category\":\"mode\",\"currentValue\":\"auto\"}]}}' ;;\n    *'\"method\":\"session/set_config_option\"'*) echo '{\"jsonrpc\":\"2.0\",\"id\":3,\"result\":{\"configOptions\":[{\"id\":\"mode\",\"category\":\"mode\",\"currentValue\":\"read-only\"}]}}' ;;",
        )
        .replace(
            "while IFS=",
            "printf '%s\\n' \"${CODEX_HOME-unset}\" > codex-home.txt\nprintf '%s\\n' \"$@\" > argv.txt\nwhile IFS=",
        )
        .replace(
            "  case \"$line\" in",
            "  printf '%s\\n' \"$line\" >> wire.txt\n  case \"$line\" in",
        );
    let bin = tests::fake_agent(&dir, &script);
    let spec = AcpAgentSpawn {
        id: "policy".into(),
        engine: "codex".into(),
        command: bin.to_string_lossy().into_owned(),
        args: vec![],
        cwd: Some(project.to_string_lossy().into_owned()),
        model: None,
        identity: None,
        context: vec![],
    };
    let restrictions = workflow_read_only_restrictions("codex", &dir, &project, &[]).unwrap();
    let live = connect(
        &spec,
        Arc::new(|_, _| {}),
        "read-only".into(),
        &restrictions,
    )
    .await
    .unwrap();
    assert_eq!(
        fs::read_to_string(project.join("codex-home.txt"))
            .unwrap()
            .trim(),
        "unset"
    );
    let argv = fs::read_to_string(project.join("argv.txt")).unwrap();
    assert!(argv.contains("plugins"));
    assert!(argv.contains("home_writer"));
    assert!(argv.contains("home_remote"));
    assert!(argv.contains("project_writer"));
    assert!(argv.contains("project_remote"));
    assert!(argv.contains("intelizen"));
    let wire = fs::read_to_string(project.join("wire.txt")).unwrap();
    let new_session: Value = wire
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .find(|message| message["method"] == "session/new")
        .unwrap();
    assert_eq!(new_session["params"]["mcpServers"], json!([]));
    let mode_request: Value = wire
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .find(|message| message["method"] == "session/set_config_option")
        .unwrap();
    assert_eq!(mode_request["params"]["configId"], "mode");
    assert_eq!(mode_request["params"]["value"], "read-only");
    assert_eq!(
        live.options.lock().unwrap().permission_mode.as_deref(),
        Some("read-only")
    );
    live.kill();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn workflow_read_only_rejects_unverified_adapters_and_registry_arguments() {
    let unverified = AcpAgentSpawn {
        id: "test".into(),
        engine: "codex".into(),
        command: "/bin/ls".into(),
        args: vec![],
        cwd: None,
        model: None,
        identity: None,
        context: vec![],
    };
    assert!(verify_workflow_read_only_adapter(&unverified).is_err());
    let with_args = AcpAgentSpawn {
        args: vec!["-c".into(), "mcp_servers.writer.enabled=true".into()],
        ..unverified
    };
    assert!(verify_workflow_read_only_adapter(&with_args)
        .unwrap_err()
        .contains("without registry arguments"));
}

#[test]
fn workflow_read_only_accepts_only_the_named_npm_codex_acp_entrypoint() {
    let dir = std::env::temp_dir().join(format!("acp-npm-entry-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let package = dir.join("node_modules/@agentclientprotocol/codex-acp");
    let target = package.join("dist/index.js");
    let shim = dir.join("node_modules/.bin/codex-acp");
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::create_dir_all(shim.parent().unwrap()).unwrap();
    fs::write(
        package.join("package.json"),
        r#"{"name":"@agentclientprotocol/codex-acp","bin":{"codex-acp":"dist/index.js"}}"#,
    )
    .unwrap();
    fs::write(&target, "#!/usr/bin/env node\n").unwrap();
    let mut permissions = fs::metadata(&target).unwrap().permissions();
    use std::os::unix::fs::PermissionsExt;
    permissions.set_mode(0o755);
    fs::set_permissions(&target, permissions).unwrap();
    symlink("../@agentclientprotocol/codex-acp/dist/index.js", &shim).unwrap();

    let spec = AcpAgentSpawn {
        id: "npm-codex".into(),
        engine: "codex".into(),
        command: shim.to_string_lossy().into_owned(),
        args: vec![],
        cwd: None,
        model: None,
        identity: None,
        context: vec![],
    };
    assert!(verify_workflow_read_only_adapter(&spec).is_ok());

    fs::write(
        package.join("package.json"),
        r#"{"name":"unrelated","bin":{"codex-acp":"dist/index.js"}}"#,
    )
    .unwrap();
    assert!(verify_workflow_read_only_adapter(&spec).is_err());
    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
#[ignore = "requires a logged-in codex-acp adapter"]
async fn the_installed_codex_adapter_answers_one_turn() {
    let seen: Arc<std::sync::Mutex<Vec<Value>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink_seen = Arc::clone(&seen);
    let sink: Sink = Arc::new(move |_, envelope| sink_seen.lock().unwrap().push(envelope));
    let spec = AcpAgentSpawn {
        id: "live-codex".into(),
        engine: "codex".into(),
        command: std::env::var("INTELLIZEN_LIVE_ACP_COMMAND")
            .unwrap_or_else(|_| "codex-acp".into()),
        args: vec![],
        cwd: Some(env!("CARGO_MANIFEST_DIR").into()),
        model: Some(
            std::env::var("INTELLIZEN_LIVE_ACP_MODEL").unwrap_or_else(|_| "gpt-5.5".into()),
        ),
        identity: None,
        context: vec![],
    };
    let live = connect(&spec, sink, "live-test".into(), &Default::default())
        .await
        .expect("codex-acp handshake");

    prompt(&live, "Reply with exactly: ACP OK")
        .await
        .expect("submit prompt");

    for _ in 0..600 {
        if seen
            .lock()
            .unwrap()
            .iter()
            .any(|event| event["type"] == "message.complete")
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let events = seen.lock().unwrap().clone();
    let complete = events
        .iter()
        .find(|event| event["type"] == "message.complete")
        .unwrap_or_else(|| panic!("turn never completed: {events:?}"));
    assert_eq!(complete["payload"]["status"], "complete", "{complete:?}");
    let text = events
        .iter()
        .filter(|event| event["type"] == "message.delta")
        .filter_map(|event| event["payload"]["text"].as_str())
        .collect::<String>();
    assert!(
        text.contains("ACP OK"),
        "missing streamed reply: {events:?}"
    );
    live.kill();
}
