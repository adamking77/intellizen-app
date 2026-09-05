//! Verify restrictions on the actual spawn/JSON-RPC path, using a local fake adapter.
use super::*;
use crate::cli_capability_policy::{restrictions, Selection};
use std::fs;

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
