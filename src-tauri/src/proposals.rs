//! Agent edits to a document, held back until Adam accepts them.
//!
//! Ported from hermes-app `crates/store/src/proposals.rs`. A proposal is one
//! small JSON file under `<app_data_dir>/proposals/` carrying the whole text
//! the agent would have the document say. Hunks are never stored: they are
//! computed on every read by diffing that text against the file as it stands
//! now, so a document edited underneath a review re-derives its hunks instead
//! of applying stale ones. The on-disk shape is shared with
//! `mcp-server/src/proposals.ts`, which writes the same file.
//!
//! Accepting a hunk writes it into the document and nothing else; rejecting a
//! hunk rewrites the proposal so that hunk is no longer proposed. When no hunk
//! is left the proposal file is removed.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use similar::{DiffOp, TextDiff};
use tauri::{AppHandle, Manager};

/// The file the MCP server writes and this module reads. Keep it this small.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalFile {
    pub id: String,
    /// Vault-relative (`$HOME/vault/intelligence/<path>`) or absolute.
    pub doc_path: String,
    pub author: String,
    #[serde(default)]
    pub note: String,
    pub new_text: String,
    /// Milliseconds since the epoch.
    pub at: i64,
}

/// One contiguous change: the lines it replaces and what replaces them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub id: usize,
    /// First line of `old` in the document, zero-based.
    pub at: usize,
    pub old: Vec<String>,
    pub new: Vec<String>,
}

/// What the strip renders: the file plus its hunks against the document now.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub id: String,
    pub doc_path: String,
    pub author: String,
    pub note: String,
    pub at: i64,
    pub hunks: Vec<Hunk>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    pub doc_path: String,
    pub new_text: String,
    pub author: String,
    #[serde(default)]
    pub note: String,
}

// ── Tauri commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn proposals_list(app: AppHandle, doc_path: String) -> Result<Vec<Proposal>, String> {
    let store = Store::new(&app)?;
    store.list(&doc_path)
}

#[tauri::command]
pub fn proposal_create(app: AppHandle, input: CreateInput) -> Result<Proposal, String> {
    let store = Store::new(&app)?;
    store.create(input)
}

/// Write the hunks given into the document. Returns the document text after
/// the write so the editor can show it. Hunks are matched by their text, not
/// their id: the id is a position in a diff that a concurrent edit renumbers.
#[tauri::command]
pub fn proposal_accept_hunk(
    app: AppHandle,
    doc_path: String,
    id: String,
    hunks: Vec<Hunk>,
) -> Result<String, String> {
    let store = Store::new(&app)?;
    store.accept(&doc_path, &id, &hunks)
}

/// Drop the hunks given from the proposal. An empty list discards it whole.
#[tauri::command]
pub fn proposal_reject_hunk(
    app: AppHandle,
    doc_path: String,
    id: String,
    hunks: Vec<Hunk>,
) -> Result<(), String> {
    let store = Store::new(&app)?;
    store.reject(&doc_path, &id, &hunks)
}

// ── The store ─────────────────────────────────────────────────────────────

pub struct Store {
    dir: PathBuf,
    vault: PathBuf,
}

impl Store {
    fn new(app: &AppHandle) -> Result<Self, String> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("No app data directory: {e}"))?;
        let home = app
            .path()
            .home_dir()
            .map_err(|e| format!("No home directory: {e}"))?;
        Ok(Self::at(data.join("proposals"), home.join("vault").join("intelligence")))
    }

    pub fn at(dir: PathBuf, vault: PathBuf) -> Self {
        Self { dir, vault }
    }

    pub fn list(&self, doc_path: &str) -> Result<Vec<Proposal>, String> {
        let doc = self.resolve(doc_path)?;
        let current = read(&doc)?;
        let mut out: Vec<Proposal> = self
            .files()
            .into_iter()
            .filter(|f| f.doc_path == doc_path)
            .map(|f| render(f, &current))
            .filter(|p| !p.hunks.is_empty())
            .collect();
        out.sort_by_key(|p| p.at);
        Ok(out)
    }

    pub fn create(&self, input: CreateInput) -> Result<Proposal, String> {
        let doc = self.resolve(&input.doc_path)?;
        let current = read(&doc)?;
        let new_text = keep_frontmatter(&current, &input.new_text);
        if diff(&current, &new_text).is_empty() {
            return Err("That proposal changes nothing.".into());
        }
        let file = ProposalFile {
            id: new_id(),
            doc_path: input.doc_path,
            author: input.author,
            note: input.note.trim().to_string(),
            new_text,
            at: now_ms(),
        };
        self.write(&file)?;
        Ok(render(file, &current))
    }

    pub fn accept(&self, doc_path: &str, id: &str, chosen: &[Hunk]) -> Result<String, String> {
        let doc = self.resolve(doc_path)?;
        let file = self.read_one(doc_path, id)?;
        let current = read(&doc)?;
        let fresh = diff(&current, &file.new_text);
        let matched = select(&fresh, chosen)?;
        let next = apply(&current, &matched);
        std::fs::write(&doc, &next).map_err(|e| format!("could not write {}: {e}", doc.display()))?;
        if diff(&next, &file.new_text).is_empty() {
            self.remove(id)?;
        }
        Ok(next)
    }

    pub fn reject(&self, doc_path: &str, id: &str, dropped: &[Hunk]) -> Result<(), String> {
        let doc = self.resolve(doc_path)?;
        let mut file = self.read_one(doc_path, id)?;
        if dropped.is_empty() {
            return self.remove(id);
        }
        let current = read(&doc)?;
        let fresh = diff(&current, &file.new_text);
        let dropping = select(&fresh, dropped)?;
        let kept: Vec<Hunk> = fresh
            .iter()
            .filter(|h| !dropping.iter().any(|d| d.old == h.old && d.new == h.new))
            .cloned()
            .collect();
        if kept.is_empty() {
            return self.remove(id);
        }
        file.new_text = apply(&current, &kept);
        self.write(&file)
    }

    fn files(&self) -> Vec<ProposalFile> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
            .filter_map(|e| std::fs::read_to_string(e.path()).ok())
            .filter_map(|t| serde_json::from_str::<ProposalFile>(&t).ok())
            .collect()
    }

    fn read_one(&self, doc_path: &str, id: &str) -> Result<ProposalFile, String> {
        self.files()
            .into_iter()
            .find(|f| f.id == id && f.doc_path == doc_path)
            .ok_or_else(|| "That proposal is no longer waiting.".to_string())
    }

    fn write(&self, file: &ProposalFile) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|e| format!("could not create {}: {e}", self.dir.display()))?;
        let path = self.dir.join(format!("{}.json", file.id));
        let tmp = path.with_extension("tmp");
        let body = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, body).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("could not write {}: {e}", path.display()))
    }

    fn remove(&self, id: &str) -> Result<(), String> {
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(format!("unusable proposal id: {id}"));
        }
        // Already gone is the outcome asked for, not a failure.
        let _ = std::fs::remove_file(self.dir.join(format!("{id}.json")));
        Ok(())
    }

    /// The trust boundary: paths arrive from the frontend and the MCP server.
    /// Relative paths live under the vault; absolute ones are allowed because
    /// Docs tracks files outside the vault too, but never through `..`.
    fn resolve(&self, doc_path: &str) -> Result<PathBuf, String> {
        if doc_path.is_empty() || doc_path.split(['/', '\\']).any(|s| s == "..") {
            return Err(format!("unusable document path: {doc_path}"));
        }
        let path = Path::new(doc_path);
        Ok(if path.is_absolute() { path.to_path_buf() } else { self.vault.join(path) })
    }
}

// ── Pure helpers ──────────────────────────────────────────────────────────

fn read(doc: &Path) -> Result<String, String> {
    std::fs::read_to_string(doc).map_err(|e| format!("could not read {}: {e}", doc.display()))
}

fn render(file: ProposalFile, current: &str) -> Proposal {
    Proposal {
        hunks: diff(current, &file.new_text),
        id: file.id,
        doc_path: file.doc_path,
        author: file.author,
        note: file.note,
        at: file.at,
    }
}

/// Docs carry a `---` frontmatter block with the record id. An agent that
/// hands back a bare body would otherwise propose deleting it as hunk one.
fn keep_frontmatter(current: &str, proposed: &str) -> String {
    if proposed.starts_with("---\n") || !current.starts_with("---\n") {
        return proposed.to_string();
    }
    let Some(close) = current[4..].find("\n---") else {
        return proposed.to_string();
    };
    let end = 4 + close + 4;
    let mut end = current[end..].find('\n').map_or(current.len(), |n| end + n + 1);
    while current[end..].starts_with('\n') {
        end += 1;
    }
    format!("{}{}", &current[..end], proposed)
}

fn lines(text: &str) -> Vec<&str> {
    text.lines().collect()
}

/// The changes turning `a` into `b`, as contiguous hunks, via `similar`.
pub fn diff(a: &str, b: &str) -> Vec<Hunk> {
    let (old, new) = (lines(a), lines(b));
    let text = TextDiff::from_slices(&old, &new);
    let mut hunks = Vec::new();
    for group in text.grouped_ops(0) {
        let (mut o0, mut o1, mut n0, mut n1) = (usize::MAX, 0, usize::MAX, 0);
        for op in group {
            if let DiffOp::Equal { .. } = op {
                continue;
            }
            let (os, ol, ns, nl) = match op {
                DiffOp::Delete { old_index, old_len, new_index } => (old_index, old_len, new_index, 0),
                DiffOp::Insert { old_index, new_index, new_len } => (old_index, 0, new_index, new_len),
                DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                    (old_index, old_len, new_index, new_len)
                }
                DiffOp::Equal { .. } => unreachable!(),
            };
            o0 = o0.min(os);
            o1 = o1.max(os + ol);
            n0 = n0.min(ns);
            n1 = n1.max(ns + nl);
        }
        if o0 == usize::MAX {
            continue;
        }
        hunks.push(Hunk {
            id: hunks.len(),
            at: o0,
            old: old[o0..o1].iter().map(|s| s.to_string()).collect(),
            new: new[n0..n1].iter().map(|s| s.to_string()).collect(),
        });
    }
    hunks
}

/// Carry the hunks the person was shown over to the fresh diff by their text.
/// One that no longer appears has had the lines it was written against edited
/// away, and is refused rather than forced.
fn select(fresh: &[Hunk], chosen: &[Hunk]) -> Result<Vec<Hunk>, String> {
    let mut out = Vec::new();
    for c in chosen {
        match fresh.iter().find(|h| h.old == c.old && h.new == c.new) {
            Some(h) => out.push(h.clone()),
            None => {
                return Err("This document changed since that was proposed, so those edits no longer fit. \
                            Nothing was written — the changes have been re-read against the file as it is now."
                    .into())
            }
        }
    }
    out.sort_by_key(|h| h.at);
    Ok(out)
}

/// Apply hunks (sorted by `at`, non-overlapping) to `current`, keeping its
/// trailing-newline habit.
fn apply(current: &str, hunks: &[Hunk]) -> String {
    let now = lines(current);
    let mut out: Vec<&str> = Vec::new();
    let mut at = 0usize;
    for h in hunks {
        out.extend_from_slice(&now[at..h.at]);
        out.extend(h.new.iter().map(String::as_str));
        at = h.at + h.old.len();
    }
    out.extend_from_slice(&now[at..]);
    let mut text = out.join("\n");
    if current.ends_with('\n') && !text.is_empty() {
        text.push('\n');
    }
    text
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    format!("prop-{:x}-{:x}", now_ms(), SEQ.fetch_add(1, Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> (Store, PathBuf) {
        let root = std::env::temp_dir().join(format!("iz-proposals-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("vault")).unwrap();
        (Store::at(root.join("proposals"), root.join("vault")), root)
    }

    fn doc(root: &Path, body: &str) -> String {
        std::fs::write(root.join("vault").join("Report.md"), body).unwrap();
        "Report.md".to_string()
    }

    fn body(root: &Path) -> String {
        std::fs::read_to_string(root.join("vault").join("Report.md")).unwrap()
    }

    fn create(store: &Store, path: &str, new_text: &str) -> Proposal {
        store
            .create(CreateInput {
                doc_path: path.into(),
                new_text: new_text.into(),
                author: "Ada".into(),
                note: "".into(),
            })
            .unwrap()
    }

    #[test]
    fn the_hunks_are_the_changes_and_nothing_else() {
        let hunks = diff(
            "keep one\nreplace me\nkeep two\ndelete me\nkeep three\n",
            "inserted\nkeep one\nreplaced\nkeep two\nkeep three\n",
        );
        assert_eq!(hunks.len(), 3, "{hunks:#?}");
        assert_eq!((hunks[0].at, &hunks[0].old[..], &hunks[0].new[..]), (0, &[][..], &["inserted".to_string()][..]));
        assert_eq!((hunks[1].at, &hunks[1].old[..], &hunks[1].new[..]), (1, &["replace me".to_string()][..], &["replaced".to_string()][..]));
        assert_eq!((hunks[2].at, &hunks[2].old[..], &hunks[2].new[..]), (3, &["delete me".to_string()][..], &[][..]));
    }

    #[test]
    fn accepting_one_hunk_writes_only_that_hunk() {
        let (store, root) = scratch("one");
        let path = doc(&root, "one\ntwo\nthree\nfour\n");
        let p = create(&store, &path, "ONE\ntwo\nthree\nFOUR\n");
        assert_eq!(p.hunks.len(), 2);

        let after = store.accept(&path, &p.id, &[p.hunks[1].clone()]).unwrap();
        assert_eq!(after, "one\ntwo\nthree\nFOUR\n");
        assert_eq!(body(&root), after);

        let left = store.list(&path).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].hunks.len(), 1, "the other hunk is still offered");
        assert_eq!(left[0].hunks[0].new, vec!["ONE".to_string()]);
    }

    #[test]
    fn rejecting_one_hunk_leaves_the_file_and_drops_the_hunk() {
        let (store, root) = scratch("reject");
        let path = doc(&root, "one\ntwo\nthree\n");
        let p = create(&store, &path, "ONE\ntwo\nTHREE\n");

        store.reject(&path, &p.id, &[p.hunks[0].clone()]).unwrap();
        assert_eq!(body(&root), "one\ntwo\nthree\n");
        let left = store.list(&path).unwrap();
        assert_eq!(left[0].hunks.len(), 1);
        assert_eq!(left[0].hunks[0].old, vec!["three".to_string()]);

        store.reject(&path, &p.id, &left[0].hunks).unwrap();
        assert!(store.list(&path).unwrap().is_empty(), "nothing left, so the proposal is gone");
    }

    #[test]
    fn accepting_everything_removes_the_proposal() {
        let (store, root) = scratch("all");
        let path = doc(&root, "one\ntwo\n");
        let p = create(&store, &path, "one\nTWO\n");
        store.accept(&path, &p.id, &p.hunks).unwrap();
        assert_eq!(body(&root), "one\nTWO\n");
        assert!(store.list(&path).unwrap().is_empty());
        assert!(store.files().is_empty());
    }

    #[test]
    fn a_document_that_moved_on_refuses_rather_than_overwrites() {
        let (store, root) = scratch("stale");
        let path = doc(&root, "one\ntwo\nthree\n");
        let p = create(&store, &path, "one\nTWO\nthree\n");
        doc(&root, "one\nmine now\nthree\n");

        assert!(store.accept(&path, &p.id, &p.hunks).is_err());
        assert_eq!(body(&root), "one\nmine now\nthree\n");
        assert_eq!(store.list(&path).unwrap().len(), 1, "re-read against the file as it is now");
    }

    #[test]
    fn an_edit_somewhere_else_still_applies() {
        let (store, root) = scratch("elsewhere");
        let path = doc(&root, "one\ntwo\nthree\n");
        let p = create(&store, &path, "one\ntwo\nTHREE\n");
        doc(&root, "ZERO\none\ntwo\nthree\n");
        store.accept(&path, &p.id, &p.hunks).unwrap();
        assert_eq!(body(&root), "ZERO\none\ntwo\nTHREE\n");
    }

    #[test]
    fn a_bare_body_keeps_the_frontmatter() {
        let (store, root) = scratch("fm");
        let path = doc(&root, "---\nintellizen_id: abc\n---\n\nold\n");
        let p = create(&store, &path, "new\n");
        assert_eq!(p.hunks.len(), 1);
        assert_eq!(p.hunks[0].old, vec!["old".to_string()]);
        store.accept(&path, &p.id, &p.hunks).unwrap();
        assert_eq!(body(&root), "---\nintellizen_id: abc\n---\n\nnew\n");
    }

    #[test]
    fn an_empty_proposal_and_a_bad_path_are_refused() {
        let (store, root) = scratch("bad");
        let path = doc(&root, "same\n");
        assert!(store
            .create(CreateInput { doc_path: path.clone(), new_text: "same\n".into(), author: "a".into(), note: "".into() })
            .is_err());
        assert!(store.list("../etc/passwd").is_err());
        assert!(store.reject(&path, "../secret", &[]).is_err());
    }

    #[test]
    fn the_file_shape_is_the_one_the_mcp_server_writes() {
        let raw = r#"{"id":"prop-1","docPath":"Report.md","author":"Ada","note":"n","newText":"x\n","at":1}"#;
        let file: ProposalFile = serde_json::from_str(raw).unwrap();
        assert_eq!(file.doc_path, "Report.md");
        let back = serde_json::to_string(&file).unwrap();
        assert!(!back.contains('_'), "camelCase across the bridge: {back}");
    }
}
