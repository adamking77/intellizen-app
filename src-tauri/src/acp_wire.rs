//! ACP wire shapes to gateway event shapes. Pure: no I/O, no process.

use std::{collections::HashMap, time::Instant};

use serde_json::{json, Value};

pub(crate) fn text(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The text inside an ACP content block list, joined.
fn content_text(content: Option<&Value>) -> String {
    let Some(items) = content.and_then(Value::as_array) else {
        return String::new();
    };
    let mut out: Vec<String> = Vec::new();
    for item in items {
        let block = item.get("content").unwrap_or(item);
        if let Some(t) = block.get("text").and_then(Value::as_str) {
            out.push(t.to_string());
        } else if item.get("type").and_then(Value::as_str) == Some("diff") {
            let path = text(item.get("path"));
            let old = text(item.get("oldText"));
            let new = text(item.get("newText"));
            out.push(format!("--- {path}\n-{old}\n+{new}"));
        }
    }
    out.join("\n")
}

/// The one line the tool row shows: the shell command when there is one,
/// else the adapter's title.
fn tool_context(update: &Value) -> String {
    let raw = update.get("rawInput");
    let command = raw
        .and_then(|r| r.get("command"))
        .and_then(|c| match c {
            Value::String(s) => Some(s.clone()),
            Value::Array(parts) => Some(
                parts
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
            _ => None,
        })
        .filter(|s| !s.trim().is_empty());
    command.unwrap_or_else(|| text(update.get("title")))
}

/// Translate one `session/update` into a gateway event, or `None` for the
/// updates the panel does not render (available commands, session info).
pub fn translate_update(
    update: &Value,
    tool_started: &mut HashMap<String, Instant>,
    now: Instant,
) -> Option<(&'static str, Value)> {
    let kind = update.get("sessionUpdate").and_then(Value::as_str)?;
    match kind {
        "agent_message_chunk" => {
            let t = text(update.get("content").and_then(|c| c.get("text")));
            (!t.is_empty()).then(|| ("message.delta", json!({ "text": t })))
        }
        "agent_thought_chunk" => {
            let t = text(update.get("content").and_then(|c| c.get("text")));
            (!t.is_empty()).then(|| ("reasoning.delta", json!({ "text": t })))
        }
        "tool_call" => {
            let id = text(update.get("toolCallId"));
            tool_started.insert(id.clone(), now);
            let name = text(update.get("kind"));
            let title = text(update.get("title"));
            let mut payload = json!({
                "tool_id": id,
                "name": if name.is_empty() { title.clone() } else { name },
                "context": tool_context(update),
            });
            if let Some(args) = update.get("rawInput").filter(|v| v.is_object()) {
                payload["args"] = args.clone();
            }
            Some(("tool.start", payload))
        }
        "tool_call_update" => {
            let status = update.get("status").and_then(Value::as_str)?;
            if status != "completed" && status != "failed" {
                return None;
            }
            let id = text(update.get("toolCallId"));
            let mut result_text = content_text(update.get("content"));
            if result_text.is_empty() {
                if let Some(raw) = update.get("rawOutput") {
                    result_text = match raw {
                        Value::String(s) => s.clone(),
                        other => serde_json::to_string_pretty(other).unwrap_or_default(),
                    };
                }
            }
            let result = if status == "failed" {
                json!({ "error": if result_text.is_empty() { "The tool failed.".to_string() } else { result_text.clone() } })
            } else {
                json!({ "output": result_text })
            };
            let mut payload = json!({
                "tool_id": id,
                "result": result,
                "result_text": result_text,
                "summary": if status == "failed" { "✗ failed" } else { "✓ done" },
            });
            if let Some(started) = tool_started.remove(&id) {
                payload["duration_s"] = json!(now.duration_since(started).as_secs_f64());
            }
            if let Some(title) = update.get("title").and_then(Value::as_str) {
                payload["name"] = json!(title);
            }
            Some(("tool.complete", payload))
        }
        "usage_update" => Some((
            "session.usage",
            json!({ "usage": {
                "context_used": update.get("used").and_then(Value::as_u64).unwrap_or(0),
                "context_max": update.get("size").and_then(Value::as_u64).unwrap_or(0),
            }}),
        )),
        _ => None,
    }
}

/// Hermes's four choice names, from the adapter's option kinds, in the
/// adapter's order and without repeats.
pub fn permission_choices(options: &[Value]) -> Vec<&'static str> {
    let mut choices: Vec<&'static str> = Vec::new();
    for option in options {
        let choice = match option.get("kind").and_then(Value::as_str) {
            Some("allow_once") => "once",
            Some("allow_always") => "always",
            Some("reject_once") => "deny",
            Some("reject_always") => "deny_always",
            _ => continue,
        };
        if !choices.contains(&choice) {
            choices.push(choice);
        }
    }
    if choices.is_empty() {
        choices = vec!["once", "deny"];
    }
    choices
}

/// The `approval.request` payload for a `session/request_permission`.
pub fn permission_payload(request_id: &str, params: &Value) -> Value {
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let options = params
        .get("options")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let title = text(tool_call.get("title"));
    let kind = text(tool_call.get("kind"));
    json!({
        "request_id": request_id,
        "command": tool_context(&tool_call),
        "description": if kind.is_empty() || kind == title { title } else { format!("{kind} · {title}") },
        "choices": permission_choices(&options),
        "options": options,
        "tool_id": tool_call.get("toolCallId").cloned().unwrap_or(Value::Null),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn translate(body: Value) -> Option<(&'static str, Value)> {
        let mut tools = HashMap::new();
        translate_update(&body, &mut tools, Instant::now())
    }

    #[test]
    fn message_and_thought_chunks_become_deltas() {
        let (t, p) = translate(json!({
            "sessionUpdate": "agent_message_chunk",
            "content": { "type": "text", "text": "pong" }
        }))
        .unwrap();
        assert_eq!(t, "message.delta");
        assert_eq!(p, json!({ "text": "pong" }));

        let (t, _) = translate(json!({
            "sessionUpdate": "agent_thought_chunk",
            "content": { "type": "text", "text": "hmm" }
        }))
        .unwrap();
        assert_eq!(t, "reasoning.delta");
        assert!(translate(json!({ "sessionUpdate": "agent_message_chunk" })).is_none());
    }

    #[test]
    fn a_tool_call_starts_and_settles_with_a_duration() {
        let mut tools = HashMap::new();
        let start = Instant::now();
        let (t, p) = translate_update(
            &json!({
                "sessionUpdate": "tool_call", "toolCallId": "t1", "kind": "execute",
                "title": "Run date", "rawInput": { "command": "date" }
            }),
            &mut tools,
            start,
        )
        .unwrap();
        assert_eq!(t, "tool.start");
        assert_eq!(p["tool_id"], "t1");
        assert_eq!(p["name"], "execute");
        assert_eq!(p["context"], "date");
        assert_eq!(p["args"]["command"], "date");

        assert!(translate_update(
            &json!({ "sessionUpdate": "tool_call_update", "toolCallId": "t1", "status": "in_progress" }),
            &mut tools,
            start,
        )
        .is_none());

        let (t, p) = translate_update(
            &json!({
                "sessionUpdate": "tool_call_update", "toolCallId": "t1", "status": "completed",
                "content": [{ "type": "content", "content": { "type": "text", "text": "Wed Sep 2" } }]
            }),
            &mut tools,
            start + Duration::from_millis(1500),
        )
        .unwrap();
        assert_eq!(t, "tool.complete");
        assert_eq!(p["result_text"], "Wed Sep 2");
        assert_eq!(p["result"]["output"], "Wed Sep 2");
        assert!((p["duration_s"].as_f64().unwrap() - 1.5).abs() < 0.01);
        assert!(tools.is_empty());
    }

    #[test]
    fn a_failed_tool_reads_as_an_error_result() {
        let (_, p) = translate(json!({
            "sessionUpdate": "tool_call_update", "toolCallId": "t2", "status": "failed",
            "rawOutput": "permission denied"
        }))
        .unwrap();
        assert_eq!(p["result"]["error"], "permission denied");
        assert_eq!(p["summary"], "✗ failed");
    }

    #[test]
    fn updates_the_panel_does_not_render_are_dropped() {
        assert!(translate(
            json!({ "sessionUpdate": "available_commands_update", "availableCommands": [] })
        )
        .is_none());
        assert!(translate(json!({})).is_none());
    }

    #[test]
    fn a_permission_request_carries_hermes_choices_and_the_real_options() {
        let params = json!({
            "sessionId": "s1",
            "toolCall": { "toolCallId": "t9", "title": "rm -rf /tmp/x", "kind": "execute",
                          "rawInput": { "command": "rm -rf /tmp/x" } },
            "options": [
                { "optionId": "allow", "name": "Allow", "kind": "allow_once" },
                { "optionId": "allow-always", "name": "Always", "kind": "allow_always" },
                { "optionId": "reject", "name": "Reject", "kind": "reject_once" },
                { "optionId": "reject-always", "name": "Always reject", "kind": "reject_always" }
            ]
        });
        let p = permission_payload("perm-4", &params);
        assert_eq!(p["request_id"], "perm-4");
        assert_eq!(p["command"], "rm -rf /tmp/x");
        assert_eq!(p["choices"], json!(["once", "always", "deny", "deny_always"]));
        assert_eq!(p["options"].as_array().unwrap().len(), 4);
        assert_eq!(permission_choices(&[]), vec!["once", "deny"]);
    }
}
