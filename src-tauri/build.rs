use std::{env, fs, path::PathBuf};

const KEY_NAMES: [&str; 2] = ["EXA_API_KEY", "VITE_EXA_API_KEY"];

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    // The release binary embeds Vite's output. Make frontend-only changes
    // invalidate the Rust package instead of silently reusing an older app.
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../.env.local");
    println!("cargo:rerun-if-changed=../.env");

    if let Some(value) = resolve_exa_api_key() {
        println!("cargo:rustc-env=INTELLIZEN_COMPILED_EXA_API_KEY={value}");
    }

    clear_stale_codegen_assets();
    tauri_build::build()
}

fn clear_stale_codegen_assets() {
    let Some(out_dir) = env::var_os("OUT_DIR") else {
        return;
    };
    let assets = PathBuf::from(out_dir).join("tauri-codegen-assets");
    if assets.exists() {
        fs::remove_dir_all(&assets).expect("remove stale Tauri codegen assets");
    }
}

fn resolve_exa_api_key() -> Option<String> {
    for key_name in KEY_NAMES {
        if let Ok(value) = env::var(key_name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    for path in [PathBuf::from("../.env.local"), PathBuf::from("../.env")] {
        let Ok(contents) = fs::read_to_string(path) else {
            continue;
        };

        for key_name in KEY_NAMES {
            if let Some(value) = parse_env_var(&contents, key_name) {
                return Some(value);
            }
        }
    }

    None
}

fn parse_env_var(contents: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");

    contents.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || !trimmed.starts_with(&prefix) {
            return None;
        }

        let value = trimmed[prefix.len()..].trim();
        Some(strip_wrapping_quotes(value).to_string())
    })
}

fn strip_wrapping_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|inner| inner.strip_suffix('\''))
        })
        .unwrap_or(value)
}
