use std::{path::Path, process::Command};

use super::{health, http, EngineInfo, MODE_ATTACHED};

fn is_hermes_serve(command: &str) -> bool {
    let words: Vec<&str> = command.split_whitespace().collect();
    let executable = words
        .first()
        .and_then(|word| Path::new(word).file_name())
        .and_then(|name| name.to_str());
    let script = words
        .get(1)
        .and_then(|word| Path::new(word).file_name())
        .and_then(|name| name.to_str());
    let direct = executable == Some("hermes")
        || (executable.is_some_and(|name| name.starts_with("python")) && script == Some("hermes"));
    let module = words
        .windows(2)
        .any(|pair| pair == ["-m", "hermes_cli.main"]);
    (direct || module) && words.contains(&"serve")
}

fn serve_processes(output: &str) -> Vec<(u32, String)> {
    let mut processes: Vec<(u32, String)> = output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let split = line.find(char::is_whitespace)?;
            let pid = line[..split].parse().ok()?;
            let command = line[split..].trim().to_string();
            is_hermes_serve(&command).then_some((pid, command))
        })
        .collect();
    // A plain/default serve is the shared machine door. A named-profile
    // serve remains a fallback, and the newest matching process wins ties.
    processes.sort_by(|left, right| {
        let left_named = left.1.contains("--profile");
        let right_named = right.1.contains("--profile");
        left_named
            .cmp(&right_named)
            .then_with(|| right.0.cmp(&left.0))
    });
    processes
}

fn running_hermes_serves() -> Vec<(u32, String)> {
    let Ok(output) = Command::new("ps").args(["-axo", "pid=,command="]).output() else {
        return Vec::new();
    };
    serve_processes(&String::from_utf8_lossy(&output.stdout))
}

fn loopback_ports(output: &str) -> Vec<u16> {
    let mut ports = Vec::new();
    for line in output.lines().filter_map(|line| line.strip_prefix('n')) {
        let Some((host, raw_port)) = line.rsplit_once(':') else {
            continue;
        };
        let host = host.trim_matches(['[', ']']);
        if !matches!(host, "127.0.0.1" | "::1" | "localhost") {
            continue;
        }
        let Ok(port) = raw_port.parse() else {
            continue;
        };
        if !ports.contains(&port) {
            ports.push(port);
        }
    }
    ports
}

fn listening_ports(pid: u32) -> Vec<u16> {
    let pid = pid.to_string();
    let Ok(output) = Command::new("lsof")
        .args(["-nP", "-a", "-p", &pid, "-iTCP", "-sTCP:LISTEN", "-Fn"])
        .output()
    else {
        return Vec::new();
    };
    loopback_ports(&String::from_utf8_lossy(&output.stdout))
}

fn dashboard_session_token(html: &str) -> Option<String> {
    const MARKER: &str = "window.__HERMES_SESSION_TOKEN__=";
    let value = html.split_once(MARKER)?.1.split_once(';')?.0.trim();
    serde_json::from_str::<String>(value)
        .ok()
        .filter(|token| !token.is_empty())
}

async fn session_token(port: u16) -> Result<String, String> {
    let html = http()
        .get(format!("http://127.0.0.1:{port}/"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    dashboard_session_token(&html)
        .ok_or_else(|| "Hermes did not expose a loopback session token".to_string())
}

pub(super) async fn discover_running_engine() -> Option<EngineInfo> {
    for (pid, _) in running_hermes_serves() {
        for port in listening_ports(pid) {
            let Ok(version) = health(port).await else {
                continue;
            };
            let Ok(token) = session_token(port).await else {
                continue;
            };
            return Some(EngineInfo::new(MODE_ATTACHED, pid, port, token, version));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::pid_alive;

    #[test]
    fn prefers_the_default_and_newest_serve() {
        let processes = serve_processes(
            "12 /opt/python -m hermes_cli.main --profile fiona serve --port 0\n\
             8 /opt/hermes serve --port 9119\n\
             19 /opt/python3 /opt/hermes serve --port 0\n\
             22 /opt/hermes gateway run\n\
             30 /bin/zsh -c echo hermes serve\n",
        );
        assert_eq!(
            processes.iter().map(|row| row.0).collect::<Vec<_>>(),
            vec![19, 8, 12]
        );
    }

    #[test]
    fn accepts_only_loopback_listeners() {
        let ports =
            loopback_ports("p19\nn127.0.0.1:49228\nn*:9119\nn[::1]:56083\nn127.0.0.1:not-a-port\n");
        assert_eq!(ports, vec![49228, 56083]);
    }

    #[test]
    fn parses_the_json_encoded_dashboard_token() {
        assert_eq!(
            dashboard_session_token(
                "<script>window.__HERMES_SESSION_TOKEN__=\"abc-123\";</script>"
            ),
            Some("abc-123".into()),
        );
        assert_eq!(
            dashboard_session_token("window.__HERMES_SESSION_TOKEN__=null;"),
            None
        );
        assert_eq!(dashboard_session_token("<html>no credential</html>"), None);
    }

    #[tokio::test]
    #[ignore]
    async fn discovers_a_live_local_hermes_without_owning_it() {
        let info = discover_running_engine()
            .await
            .expect("start `hermes serve` first");
        assert_eq!(info.mode, MODE_ATTACHED);
        assert!(pid_alive(info.pid));
        assert_eq!(health(info.port).await.expect("health"), info.version);
        assert!(!info.token.is_empty());
    }
}
