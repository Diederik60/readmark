//! Readmark backend.
//!
//! The backend is intentionally small and viewer-agnostic: it delivers file
//! paths to the frontend, reads files, and watches them for changes. Rendering
//! happens in the frontend, where each document type has its own viewer
//! (see `src/viewers/`). A future PDF viewer can reuse the same plumbing and
//! add e.g. a `read_binary_file` command next to `read_text_file`.

mod documents;
mod menu;
mod watcher;

use documents::{OpenState, MAIN_WINDOW};
use tauri::{Manager, RunEvent, WindowEvent};
use watcher::WatchState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Windows / Linux: a second launch (e.g. double clicking another file)
    // forwards its arguments to the running instance and exits.
    // Must be the first plugin registered.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let args = argv.into_iter().map(std::ffi::OsString::from);
            let paths = documents::paths_from_args(args, std::path::Path::new(&cwd));
            if paths.is_empty() {
                documents::ensure_main_window(app);
                if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            } else {
                documents::request_open(app, paths);
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OpenState::default())
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![
            documents::frontend_ready,
            documents::read_text_file,
            watcher::watch_file,
            watcher::unwatch_file,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let menu = menu::build(app.handle())?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()));
            }

            // Files passed on the command line (Windows file association,
            // or `readmark file.md` from a terminal).
            let cwd = std::env::current_dir().unwrap_or_default();
            let paths = documents::paths_from_args(std::env::args_os(), &cwd);
            documents::request_open(app.handle(), paths);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == MAIN_WINDOW {
                if let WindowEvent::Destroyed = event {
                    documents::mark_not_ready(window.app_handle());
                    window.app_handle().state::<WatchState>().stop();
                }
            }
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Readmark");

    app.run(|app, event| match event {
        // macOS: files opened from Finder, both at launch and while running.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        RunEvent::Opened { urls } => {
            let paths = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .collect();
            documents::request_open(app, paths);
        }
        // macOS: clicking the Dock icon when no window is open.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { has_visible_windows, .. } => {
            if !has_visible_windows {
                documents::ensure_main_window(app);
            }
        }
        // macOS convention: keep running when the last window is closed.
        #[cfg(target_os = "macos")]
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() {
                api.prevent_exit();
            }
        }
        _ => {
            let _ = app;
        }
    });
}
