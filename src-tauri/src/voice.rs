//! Speech preparation and dictation, ported from hermes-app.
//!
//! Speaking is MiniMax `t2a_v2` (the service the donor spiked and shipped,
//! and the one Hermes's own `tts` block names on this machine). Rust makes the
//! call and writes the MP3 to a temp file for frontend playback. Dictation is
//! Whisper or Parakeet through Hermes's own
//! venv, exactly as the donor ran them; `voice_models` reads what is
//! installed rather than offering what is not.
//!
//! Credentials come from the process environment or `~/.hermes/.env`, never
//! from settings storage: this app stores no secret it was not handed.

use std::path::PathBuf;

/// Hermes's own MiniMax defaults (`tools/tts_tool.py` at the pinned commit),
/// so an agent without a voice of its own sounds the same here as it does
/// from Hermes.
const DEFAULT_MODEL: &str = "speech-02-hd";
const DEFAULT_VOICE: &str = "English_expressive_narrator";

/// A credential from the process environment, or from Hermes's own `.env`.
///
/// A GUI app does not inherit the shell's environment on macOS, so
/// `std::env::var` alone finds nothing when launched from Finder. Read on
/// demand rather than cached: a key rotated while the app is open should work
/// on the next turn.
fn env_or_hermes(name: &str) -> Option<String> {
    if let Ok(v) = std::env::var(name) {
        if !v.trim().is_empty() {
            return Some(v);
        }
    }
    let env = std::fs::read_to_string(hermes_home()?.join(".env")).ok()?;
    for line in env.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if k.trim().trim_start_matches("export ").trim() == name {
                let v = v.trim().trim_matches('"').trim_matches('\'').trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

fn hermes_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".hermes"))
}

fn hermes_python() -> Result<PathBuf, String> {
    let python = hermes_home()
        .ok_or("no home directory")?
        .join("hermes-agent/venv/bin/python3");
    if !python.exists() {
        return Err("local dictation needs Hermes installed on this machine".into());
    }
    Ok(python)
}

/// MiniMax's `t2a_v2`: hex-encoded MP3 inside a JSON body, and `200` with a
/// failure in `base_resp`, so the status code alone would report success on a
/// refused request. Returns the path of the written file.
pub async fn synthesize(text: &str, voice: &str, model: &str) -> Result<PathBuf, String> {
    let key = env_or_hermes("MINIMAX_API_KEY")
        .ok_or("MINIMAX_API_KEY is not set — add it to ~/.hermes/.env")?;
    let group = env_or_hermes("MINIMAX_GROUP_ID").unwrap_or_default();
    let url = if group.trim().is_empty() {
        "https://api.minimax.io/v1/t2a_v2".to_string()
    } else {
        format!("https://api.minimax.io/v1/t2a_v2?GroupId={group}")
    };
    let body = serde_json::json!({
        "model": if model.is_empty() { DEFAULT_MODEL } else { model },
        "text": text,
        "stream": false,
        "voice_setting": { "voice_id": if voice.is_empty() { DEFAULT_VOICE } else { voice } },
        "audio_setting": { "format": "mp3" }
    });

    let json: serde_json::Value = reqwest::Client::new()
        .post(url)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("could not reach the voice service: {e}"))?
        .json()
        .await
        .map_err(|e| format!("the voice service sent something unreadable: {e}"))?;

    let status = json.pointer("/base_resp/status_code").and_then(|v| v.as_i64());
    if status != Some(0) {
        let msg = json
            .pointer("/base_resp/status_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("the voice service refused the request");
        return Err(msg.to_string());
    }
    let audio = json
        .pointer("/data/audio")
        .and_then(|v| v.as_str())
        .ok_or("the voice service returned no audio")?;
    let bytes = hex::decode(audio)
        .map_err(|_| "the voice service returned audio this app could not decode".to_string())?;

    let path = std::env::temp_dir().join(format!("intellizen-voice-{}.mp3", std::process::id()));
    std::fs::write(&path, bytes).map_err(|e| format!("could not save the audio: {e}"))?;
    Ok(path)
}

/// Prepare speech for frontend playback. The webview plays this file through
/// an AudioContext so the avatar can follow the actual waveform instead of a
/// decorative timer.
#[tauri::command]
pub async fn voice_prepare(
    text: String,
    voice: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(String::new());
    }
    let path = synthesize(
        &text,
        voice.as_deref().unwrap_or(""),
        model.as_deref().unwrap_or(""),
    )
    .await?;
    Ok(path.to_string_lossy().into_owned())
}

/// Which service a profile speaks through and the voice id under it, read
/// from the profile's own `config.yaml` (`~/.hermes/config.yaml` for
/// `default`). Read only, never written: the agent editor changes it through
/// the gateway.
#[derive(serde::Serialize)]
pub struct ProfileVoice {
    pub service: String,
    pub voice_id: String,
}

#[tauri::command]
pub fn voice_of_profile(profile: String) -> ProfileVoice {
    let Some(home) = hermes_home() else {
        return ProfileVoice { service: String::new(), voice_id: String::new() };
    };
    let own = home.join("profiles").join(&profile).join("config.yaml");
    let path = if profile != "default" && own.exists() { own } else { home.join("config.yaml") };
    let config = std::fs::read_to_string(path).unwrap_or_default();
    let (voice_id, service) = voice_from(&config);
    ProfileVoice { service, voice_id }
}

fn clean(v: &str) -> String {
    v.trim().trim_matches('"').trim_matches('\'').trim().to_string()
}

/// `tts.provider` and the `voice_id` under that service's own block. Not a
/// YAML parser: two keys found by name, tracking which top-level block and
/// which service block the line sits in. Returns empty strings when there is
/// no voice, never a half-set pair.
fn voice_from(config: &str) -> (String, String) {
    let mut service = String::new();
    let mut in_tts = false;
    for line in config.lines() {
        if !line.starts_with(char::is_whitespace) && !line.trim().is_empty() {
            in_tts = line.trim_start().starts_with("tts:");
            continue;
        }
        if !in_tts {
            continue;
        }
        let depth = line.len() - line.trim_start().len();
        if depth == 2 {
            if let Some(v) = line.trim().strip_prefix("provider:") {
                service = clean(v);
            }
        }
    }
    if service.is_empty() {
        return (String::new(), String::new());
    }

    let mut in_tts = false;
    let mut in_service = false;
    for line in config.lines() {
        if !line.starts_with(char::is_whitespace) && !line.trim().is_empty() {
            in_tts = line.trim_start().starts_with("tts:");
            in_service = false;
            continue;
        }
        if !in_tts {
            continue;
        }
        let depth = line.len() - line.trim_start().len();
        if depth == 2 {
            in_service = line.trim().starts_with(&format!("{service}:"));
            continue;
        }
        if in_service && depth > 2 {
            if let Some(v) = line.trim().strip_prefix("voice_id:") {
                let id = clean(v);
                if id.is_empty() {
                    return (String::new(), String::new());
                }
                return (id, service);
            }
        }
    }
    (String::new(), String::new())
}

/// Turn a recording the webview made into text.
///
/// The bytes cross IPC and are written here: the webview has no filesystem
/// grant for temp files and does not want one. `model` carries its engine —
/// `whisper:base`, `parakeet:<dir>` — so a second local engine needs no second
/// service; a bare size from before ids carried their engine means Whisper.
#[tauri::command]
pub async fn voice_transcribe(bytes: Vec<u8>, model: String, language: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("nothing was recorded".into());
    }
    let path = std::env::temp_dir().join(format!("intellizen-dictation-{}.webm", std::process::id()));
    std::fs::write(&path, bytes).map_err(|e| format!("could not save the recording: {e}"))?;
    let path = path.to_string_lossy().into_owned();
    let language = if language.trim().is_empty() {
        "en".to_string()
    } else {
        language.trim().to_string()
    };
    match model.split_once(':') {
        Some(("whisper", size)) => transcribe_whisper(path, size.to_string(), language).await,
        Some(("parakeet", dir)) if language == "en" => transcribe_parakeet(path, dir.to_string()).await,
        Some(("parakeet", _)) => Err("Parakeet supports English only; choose a Whisper model for this language".into()),
        Some((other, _)) => Err(format!("{other} is not a dictation engine this app has yet")),
        None => transcribe_whisper(path, model, language).await,
    }
}

#[derive(serde::Serialize)]
pub struct SttModel {
    pub id: String,
    pub label: String,
}

/// The speech-to-text models actually present on this machine, smallest
/// first. An empty list means dictation has nothing to run, which the settings
/// page states rather than offering a choice that cannot work.
#[tauri::command]
pub fn voice_models() -> Vec<SttModel> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let home = PathBuf::from(home);
    let mut out: Vec<SttModel> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(home.join(".cache/huggingface/hub")) {
        let mut sizes: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter_map(|n| n.strip_prefix("models--Systran--faster-whisper-").map(String::from))
            .collect();
        let rank = |m: &str| match m {
            "tiny" => 0,
            "base" => 1,
            "small" => 2,
            "medium" => 3,
            "large-v3" => 4,
            _ => 9,
        };
        sizes.sort_by_key(|m| (rank(m), m.clone()));
        sizes.dedup();
        for size in sizes {
            out.push(SttModel { id: format!("whisper:{size}"), label: format!("Whisper — {size}") });
        }
    }

    let buzz = home.join(".buzz/models");
    if let Ok(entries) = std::fs::read_dir(&buzz) {
        let mut names: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.starts_with("parakeet-"))
            .filter(|n| buzz.join(n).join("model.int8.onnx").exists() && buzz.join(n).join("tokens.txt").exists())
            .collect();
        names.sort();
        for n in names {
            out.push(SttModel {
                id: format!("parakeet:{n}"),
                label: format!("Parakeet — {}", n.trim_start_matches("parakeet-")),
            });
        }
    }
    out
}

/// Every line flush left: written as an indented Rust string the whitespace
/// became Python and died on `IndentationError` before importing anything.
const WHISPER_PY: &str = concat!(
    "import sys\n",
    "from faster_whisper import WhisperModel\n",
    "m = WhisperModel(sys.argv[1], device='cpu', compute_type='int8')\n",
    "segs, _ = m.transcribe(sys.argv[2], language=sys.argv[3])\n",
    "print(' '.join(s.text.strip() for s in segs))\n",
);

/// Parakeet through the same venv: a bare ONNX graph, so the mel frontend and
/// CTC decode are here. `numpy` and `onnxruntime` are all it needs.
const PARAKEET_PY: &str = concat!(
    "import sys, wave, numpy as np, onnxruntime as ort\n",
    "d, wav = sys.argv[1], sys.argv[2]\n",
    "with wave.open(wav) as w:\n",
    "    sr = w.getframerate()\n",
    "    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)/32768.0\n",
    "    if w.getnchannels() > 1: a = a.reshape(-1, w.getnchannels()).mean(1)\n",
    "def fb(sr, n_fft, n_mels):\n",
    "    h2m = lambda f: 2595*np.log10(1+f/700)\n",
    "    m2h = lambda m: 700*(10**(m/2595)-1)\n",
    "    pts = m2h(np.linspace(h2m(0), h2m(sr/2), n_mels+2))\n",
    "    b = np.floor((n_fft+1)*pts/sr).astype(int)\n",
    "    out = np.zeros((n_mels, n_fft//2+1), np.float32)\n",
    "    for i in range(n_mels):\n",
    "        l, c, r = b[i], b[i+1], b[i+2]\n",
    "        if c == l: c = l+1\n",
    "        if r == c: r = c+1\n",
    "        for k in range(l, c): out[i, k] = (k-l)/(c-l)\n",
    "        for k in range(c, r): out[i, k] = (r-k)/(r-c)\n",
    "    return out\n",
    "n_fft, hop, win = 512, 160, 400\n",
    "pad = (n_fft-win)//2\n",
    // A tapped-and-stopped microphone is shorter than one 25ms window; padded
    // to one so the result is an empty transcript rather than a traceback.
    "if len(a) < win: a = np.pad(a, (0, win-len(a)))\n",
    "window = np.hanning(win).astype(np.float32)\n",
    "frames = []\n",
    "for st in range(0, max(1, len(a)-win+1), hop):\n",
    "    f = np.pad(a[st:st+win]*window, (pad, n_fft-win-pad))\n",
    "    frames.append(np.abs(np.fft.rfft(f))**2)\n",
    "S = np.array(frames, np.float32).T\n",
    "feat = np.log(fb(sr, n_fft, 80) @ S + 1e-9)\n",
    "feat = (feat - feat.mean(1, keepdims=True))/(feat.std(1, keepdims=True)+1e-5)\n",
    "x = feat[None].astype(np.float32)\n",
    "sess = ort.InferenceSession(d+'/model.int8.onnx', providers=['CPUExecutionProvider'])\n",
    "out = sess.run(None, {'audio_signal': x, 'length': np.array([x.shape[2]], np.int64)})[0]\n",
    "ids = out[0].argmax(-1)\n",
    "vocab = {}\n",
    "for line in open(d+'/tokens.txt', encoding='utf-8'):\n",
    "    p = line.rstrip('\\n').rsplit(' ', 1)\n",
    "    if len(p) == 2: vocab[int(p[1])] = p[0]\n",
    "blank = len(vocab)-1\n",
    "prev, pieces = -1, []\n",
    "for i in ids:\n",
    "    if i != prev and i != blank and i in vocab: pieces.append(vocab[i])\n",
    "    prev = i\n",
    "print(''.join(pieces).replace('\\u2581', ' ').strip())\n",
);

fn last_line_of(stderr: &[u8]) -> String {
    let err = String::from_utf8_lossy(stderr);
    err.lines().last().unwrap_or("local dictation failed").to_string()
}

/// Whisper through Hermes's own venv: the model, runtime and weights are
/// already on this machine and agree with each other. Measured by the donor
/// at ~2s for two seconds of audio on CPU.
async fn transcribe_whisper(path: String, model: String, language: String) -> Result<String, String> {
    let python = hermes_python()?;
    let model = if model.is_empty() { "base".to_string() } else { model };
    tauri::async_runtime::spawn_blocking(move || {
        let out = std::process::Command::new(&python)
            .arg("-c")
            .arg(WHISPER_PY)
            .arg(&model)
            .arg(&path)
            .arg(&language)
            .output()
            .map_err(|e| format!("could not run local dictation: {e}"))?;
        if !out.status.success() {
            return Err(last_line_of(&out.stderr));
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Parakeet takes 16kHz PCM, so the recording is converted first. `ffmpeg` by
/// absolute path: a GUI app does not inherit a login shell's `PATH`.
async fn transcribe_parakeet(path: String, dir: String) -> Result<String, String> {
    let python = hermes_python()?;
    let model_dir = PathBuf::from(std::env::var_os("HOME").ok_or("no home directory")?)
        .join(".buzz/models")
        .join(&dir);
    if !model_dir.join("model.int8.onnx").exists() {
        return Err(format!("{dir} is not installed any more"));
    }
    let ffmpeg = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
        .ok_or("Parakeet needs ffmpeg to read the recording — Whisper does not, and can be chosen instead")?;

    tauri::async_runtime::spawn_blocking(move || {
        let wav = std::env::temp_dir().join(format!("intellizen-dictation-{}.wav", std::process::id()));
        let conv = std::process::Command::new(&ffmpeg)
            .args(["-y", "-i", &path, "-ac", "1", "-ar", "16000", "-f", "wav"])
            .arg(&wav)
            .output()
            .map_err(|e| format!("could not convert the recording: {e}"));
        let result = conv.and_then(|conv| {
            if !conv.status.success() {
                return Err("the recording could not be converted for Parakeet".to_string());
            }
            let out = std::process::Command::new(&python)
                .arg("-c")
                .arg(PARAKEET_PY)
                .arg(&model_dir)
                .arg(&wav)
                .output()
                .map_err(|e| format!("could not run local dictation: {e}"))?;
            if !out.status.success() {
                return Err(last_line_of(&out.stderr));
            }
            Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
        });
        let _ = std::fs::remove_file(&wav);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_scripts_are_flush_left() {
        for (name, src) in [("whisper", WHISPER_PY), ("parakeet", PARAKEET_PY)] {
            let first = src.lines().next().unwrap();
            assert!(!first.starts_with(' '), "{name} script starts indented: python would refuse it");
        }
        assert!(PARAKEET_PY.contains("if len(a) < win"), "the short-audio guard is gone");
    }

    #[test]
    fn voice_is_read_from_the_named_service_block() {
        let config = "model:\n  default: x\ntts:\n  provider: minimax\n  edge:\n    voice: en\n  elevenlabs:\n    voice_id: eleven\n  minimax:\n    voice_id: \"moss_audio_1\"\n";
        assert_eq!(voice_from(config), ("moss_audio_1".into(), "minimax".into()));
        let no_block = "tts:\n  provider: minimax\nplugins:\n  enabled: []\n";
        assert_eq!(voice_from(no_block), (String::new(), String::new()));
        assert_eq!(voice_from(""), (String::new(), String::new()));
    }

    /// Makes the Mac say one sentence through the real service. Run by hand:
    /// `cargo test --manifest-path src-tauri/Cargo.toml voice::says_one_sentence -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn says_one_sentence() {
        let path = tauri::async_runtime::block_on(synthesize("IntelliZen can speak now.", "", ""))
            .expect("MiniMax answered with audio");
        let size = std::fs::metadata(&path).unwrap().len();
        assert!(size > 1000, "audio file is {size} bytes");
        let status = std::process::Command::new("/usr/bin/afplay").arg(&path).status().unwrap();
        assert!(status.success());
    }
}
