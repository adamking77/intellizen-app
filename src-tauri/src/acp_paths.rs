//! Finder-safe command and working-directory resolution for ACP adapters.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::Command,
};

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// `~` is a shell convention, not a filesystem one.
pub fn expand_tilde(value: &str) -> PathBuf {
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
            ".local/share/mise/shims",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".asdf/shims",
            ".cargo/bin",
        ] {
            dirs.push(home.join(rel));
        }
        if let Ok(versions) = std::fs::read_dir(home.join(".nvm/versions/node")) {
            for entry in versions.flatten() {
                dirs.push(entry.path().join("bin"));
            }
        }
    }
    for abs in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/home/linuxbrew/.linuxbrew/bin",
        "/Applications/ChatGPT.app/Contents/Resources",
        "/Applications/Codex.app/Contents/Resources",
        "/usr/bin",
        "/bin",
    ] {
        dirs.push(PathBuf::from(abs));
    }
    dirs
}

/// PATH entries from the user's login shell. Finder-launched applications do
/// not inherit these, but they are the authoritative source for tools managed
/// by products such as Kimi, mise, fnm, or a user-defined bin directory.
fn login_shell_bin_dirs() -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    Command::new(shell)
        .args(["-lc", "printf %s \"$PATH\""])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            let value = String::from_utf8_lossy(&output.stdout).into_owned();
            std::env::split_paths(&value).collect()
        })
        .unwrap_or_default()
}

/// Every unique directory IntelliZen uses both for discovery and spawning.
pub fn discovery_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = known_bin_dirs();
    if let Some(inherited) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&inherited));
    }
    dirs.extend(login_shell_bin_dirs());
    let mut seen = HashSet::new();
    dirs.into_iter()
        .filter(|path| path.is_dir() && seen.insert(path.clone()))
        .collect()
}

/// The PATH a child gets: known directories ahead of whatever we inherited.
pub fn child_path() -> String {
    std::env::join_paths(discovery_bin_dirs())
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    path.is_file()
}

pub fn resolve_binary(command: &str) -> Option<PathBuf> {
    let direct = expand_tilde(command);
    if direct.components().count() > 1 {
        return is_executable(&direct).then_some(direct);
    }
    discovery_bin_dirs()
        .into_iter()
        .map(|dir| dir.join(command))
        .find(|candidate| is_executable(candidate))
}

pub fn resolve_cwd(cwd: Option<&str>) -> PathBuf {
    cwd.map(expand_tilde)
        .filter(|path| path.is_dir())
        .or_else(home_dir)
        .unwrap_or_else(|| PathBuf::from("/"))
}
