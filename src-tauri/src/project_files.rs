use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const MAX_VIEW_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub id: String,
    pub title: String,
    pub path: String,
    pub folder: String,
    pub updated_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ProjectFileView {
    Text { text: String, ext: String },
    Binary { bytes: u64, ext: String },
}

#[tauri::command]
pub fn list_project_files(folders: Vec<String>) -> Vec<ProjectFile> {
    let mut seen = HashSet::new();
    let mut files = folders
        .into_iter()
        .flat_map(|folder| {
            let Some(root) = expand_folder(&folder) else {
                return Vec::new();
            };
            let Ok(entries) = fs::read_dir(&root) else {
                return Vec::new();
            };
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
                .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
                .filter_map(|entry| describe(&root, &entry.path()))
                .collect()
        })
        .filter(|file| seen.insert(file.path.clone()))
        .collect::<Vec<_>>();

    files.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then(left.title.cmp(&right.title))
    });
    files
}

#[tauri::command]
pub fn read_project_file(path: String, folders: Vec<String>) -> Result<ProjectFileView, String> {
    let path = checked_file(&path, &folders)?;
    let bytes = fs::metadata(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?
        .len();
    let ext = extension(&path);
    if bytes > MAX_VIEW_BYTES {
        return Ok(ProjectFileView::Binary { bytes, ext });
    }
    let raw =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    Ok(match String::from_utf8(raw) {
        Ok(text) => ProjectFileView::Text { text, ext },
        Err(error) => ProjectFileView::Binary {
            bytes: error.into_bytes().len() as u64,
            ext,
        },
    })
}

#[tauri::command]
pub fn read_project_image(
    path: String,
    folders: Vec<String>,
) -> Result<tauri::ipc::Response, String> {
    let path = checked_file(&path, &folders)?;
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn describe(root: &Path, path: &Path) -> Option<ProjectFile> {
    let path = path.canonicalize().ok()?;
    let root = root.canonicalize().ok()?;
    if path.parent() != Some(root.as_path()) {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let title = if matches!(extension(&path).as_str(), "md" | "markdown") {
        path.file_stem()?.to_string_lossy().to_string()
    } else {
        name
    };
    Some(ProjectFile {
        id: path.display().to_string(),
        title,
        path: path.display().to_string(),
        folder: root.display().to_string(),
        updated_at: modified_ms(&path),
    })
}

fn checked_file(path: &str, folders: &[String]) -> Result<PathBuf, String> {
    let candidate = Path::new(path)
        .canonicalize()
        .map_err(|_| "file is not available".to_string())?;
    if !candidate.is_file() {
        return Err("path is not a file".to_string());
    }
    let allowed = folders
        .iter()
        .filter_map(|folder| expand_folder(folder))
        .filter_map(|folder| folder.canonicalize().ok())
        .any(|root| candidate.parent() == Some(root.as_path()));
    if !allowed {
        return Err("file is outside this project's folders".to_string());
    }
    Ok(candidate)
}

fn expand_folder(folder: &str) -> Option<PathBuf> {
    if let Some(rest) = folder.strip_prefix("~/") {
        return std::env::var_os("HOME").map(|home| PathBuf::from(home).join(rest));
    }
    let path = PathBuf::from(folder);
    path.is_absolute().then_some(path)
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "intellizen-project-files-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("README.md"), "# Hello\n").unwrap();
        fs::write(root.join("main.ts"), "const answer = 42;\n").unwrap();
        fs::write(root.join(".env"), "SECRET=nope\n").unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("nested/hidden.ts"), "nope").unwrap();
        root
    }

    #[test]
    fn lists_only_visible_top_level_files() {
        let root = fixture("list");
        let files = list_project_files(vec![root.display().to_string()]);
        assert_eq!(files.len(), 2);
        assert!(files.iter().any(|file| file.title == "README"));
        assert!(files.iter().any(|file| file.title == "main.ts"));
    }

    #[test]
    fn refuses_reads_outside_the_declared_folder() {
        let root = fixture("read");
        let other = std::env::temp_dir().join("intellizen-project-files-outside.txt");
        fs::write(&other, "private").unwrap();
        assert!(read_project_file(
            other.display().to_string(),
            vec![root.display().to_string()]
        )
        .is_err());
        assert!(matches!(
            read_project_file(
                root.join("main.ts").display().to_string(),
                vec![root.display().to_string()]
            ),
            Ok(ProjectFileView::Text { .. })
        ));
    }
}
