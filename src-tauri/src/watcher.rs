//! Watches the currently open file and notifies the frontend when it changes.
//!
//! The parent directory is watched (not the file itself) because many editors
//! save atomically by writing a temp file and renaming it over the original,
//! which would silently break a watch on the original file.

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

use crate::documents::MAIN_WINDOW;

pub const EVENT_FILE_CHANGED: &str = "file-changed";

#[derive(Default)]
pub struct WatchState(Mutex<Option<RecommendedWatcher>>);

impl WatchState {
    pub fn stop(&self) {
        *self.0.lock().unwrap() = None;
    }
}

#[tauri::command]
pub fn watch_file(app: AppHandle, state: State<'_, WatchState>, path: String) -> Result<(), String> {
    let target = std::path::absolute(&path).map_err(|e| e.to_string())?;
    let dir = target
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "File has no parent directory".to_string())?;
    let file_name = target.file_name().map(|n| n.to_os_string());
    let emit_path = target.to_string_lossy().into_owned();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
            return;
        }
        let touches_target = event
            .paths
            .iter()
            .any(|p: &PathBuf| p.file_name().map(|n| n.to_os_string()) == file_name);
        if touches_target {
            let _ = app.emit_to(MAIN_WINDOW, EVENT_FILE_CHANGED, emit_path.clone());
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_file(state: State<'_, WatchState>) {
    state.stop();
}
