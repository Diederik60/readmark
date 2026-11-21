//! Opening documents: tracks files requested by the OS (Finder / Explorer /
//! command line / second instance) and hands them to the frontend once it is
//! ready to receive them.

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindowBuilder};

pub const MAIN_WINDOW: &str = "main";

/// Event sent to the frontend with a list of absolute file paths to open.
pub const EVENT_OPEN_FILES: &str = "open-files";

#[derive(Default)]
pub struct OpenState(Mutex<OpenInner>);

#[derive(Default)]
struct OpenInner {
    /// True once the frontend of the main window has registered its listeners.
    ready: bool,
    /// Files requested before the frontend was ready.
    pending: Vec<PathBuf>,
}

#[derive(Serialize)]
pub struct Document {
    /// Absolute path of the file.
    pub path: String,
    /// File contents decoded as UTF-8 (invalid sequences replaced).
    pub content: String,
}

/// Queue or deliver a request to open files, creating the main window if
/// necessary (on macOS the app keeps running after its window is closed).
pub fn request_open(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    ensure_main_window(app);

    let state = app.state::<OpenState>();
    let mut inner = state.0.lock().unwrap();
    if inner.ready {
        let list: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let _ = app.emit_to(MAIN_WINDOW, EVENT_OPEN_FILES, list);
    } else {
        inner.pending.extend(paths);
    }
    drop(inner);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Recreate the main window from the config if it was closed.
pub fn ensure_main_window(app: &AppHandle) {
    if app.get_webview_window(MAIN_WINDOW).is_some() {
        return;
    }
    mark_not_ready(app);
    if let Some(config) = app.config().app.windows.iter().find(|w| w.label == MAIN_WINDOW) {
        if let Ok(builder) = WebviewWindowBuilder::from_config(app, config) {
            let _ = builder.build();
        }
    }
}

/// Called when the main window is destroyed or reloaded.
pub fn mark_not_ready(app: &AppHandle) {
    app.state::<OpenState>().0.lock().unwrap().ready = false;
}

/// Extract file paths from command line arguments (Windows / Linux file
/// associations pass the document path as an argument). `cwd` is used to
/// resolve relative paths, e.g. those forwarded by a second instance.
pub fn paths_from_args<I>(args: I, cwd: &Path) -> Vec<PathBuf>
where
    I: IntoIterator<Item = OsString>,
{
    args.into_iter()
        .skip(1) // executable
        .filter(|a| !a.to_string_lossy().starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| p.is_file())
        .collect()
}

/// The frontend calls this once its event listeners are registered. Returns
/// any files that were requested before that moment.
#[tauri::command]
pub fn frontend_ready(state: State<'_, OpenState>) -> Vec<String> {
    let mut inner = state.0.lock().unwrap();
    inner.ready = true;
    inner
        .pending
        .drain(..)
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<Document, String> {
    let path = std::path::absolute(&path).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let mut content = String::from_utf8_lossy(&bytes).into_owned();
    if content.starts_with('\u{feff}') {
        content.remove(0);
    }
    Ok(Document {
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

/// Read a file as raw bytes (returned to JS as an ArrayBuffer, without JSON
/// encoding, so large PDFs stay fast).
#[tauri::command]
pub fn read_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Write raw bytes to a file. The bytes are the request body; the target path
/// is passed URL-encoded in the `path` header. The file is written to a
/// temporary file in the same folder first and then renamed over the target,
/// so a crash mid-write never leaves a half-written document behind.
#[tauri::command]
pub fn write_binary_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Expected raw bytes".into());
    };
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing path header")?;
    let path = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let path = PathBuf::from(path);
    let dir = path.parent().ok_or("Invalid path")?;
    let file_name = path.file_name().ok_or("Invalid path")?.to_string_lossy();
    let tmp = dir.join(format!(".{file_name}.readmark-tmp"));

    std::fs::write(&tmp, data).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    if let Ok(meta) = std::fs::metadata(&path) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Could not save {}: {e}", path.display())
    })
}

/// Copy `name.ext` to `name.backup.ext` next to it, unless that backup
/// already exists (the oldest backup — the original file — is kept).
/// Returns the backup path.
#[tauri::command]
pub fn backup_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    let stem = path.file_stem().ok_or("Invalid path")?.to_string_lossy();
    let backup_name = match path.extension() {
        Some(ext) => format!("{stem}.backup.{}", ext.to_string_lossy()),
        None => format!("{stem}.backup"),
    };
    let backup = path.with_file_name(backup_name);
    if !backup.exists() {
        std::fs::copy(&path, &backup).map_err(|e| format!("Could not create backup: {e}"))?;
    }
    Ok(backup.to_string_lossy().into_owned())
}

/// Name used as the author of new annotations.
#[tauri::command]
pub fn user_name() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default()
}

/// Quit the app (after the frontend has dealt with unsaved changes).
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
