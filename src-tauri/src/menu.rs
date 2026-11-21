//! Native menu bar (macOS). Windows uses the in-window toolbar instead.

use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::documents::{ensure_main_window, MAIN_WINDOW};

pub const MENU_OPEN: &str = "open";
pub const MENU_PRINT: &str = "print";

/// Custom menu items forwarded to the frontend as `menu-<id>` events.
const FORWARDED: &[&str] = &[
    MENU_OPEN, MENU_PRINT, "save", "save-as", "find", "zoom-in", "zoom-out", "zoom-fit", "quit",
];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        comments: Some("A lightweight Markdown viewer".into()),
        ..Default::default()
    };

    let app_menu = SubmenuBuilder::new(app, &pkg.name)
        .about(Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&item(app, "quit", &format!("Quit {}", pkg.name), "CmdOrCtrl+Q")?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&item(app, MENU_OPEN, "Open…", "CmdOrCtrl+O")?)
        .separator()
        .item(&item(app, "save", "Save", "CmdOrCtrl+S")?)
        .item(&item(app, "save-as", "Save As…", "CmdOrCtrl+Shift+S")?)
        .separator()
        .item(&item(app, MENU_PRINT, "Print…", "CmdOrCtrl+P")?)
        .separator()
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&item(app, "find", "Find…", "CmdOrCtrl+F")?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&item(app, "zoom-in", "Zoom In", "CmdOrCtrl+=")?)
        .item(&item(app, "zoom-out", "Zoom Out", "CmdOrCtrl+-")?)
        .item(&item(app, "zoom-fit", "Fit to Width", "CmdOrCtrl+0")?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, text: &str, accel: &str) -> tauri::Result<MenuItem<R>> {
    MenuItemBuilder::with_id(id, text).accelerator(accel).build(app)
}

pub fn handle_event(app: &AppHandle, id: &str) {
    if !FORWARDED.contains(&id) {
        return;
    }
    // Quit without a window: nothing can be unsaved.
    if id == "quit" && app.get_webview_window(MAIN_WINDOW).is_none() {
        app.exit(0);
        return;
    }
    if id == MENU_OPEN {
        ensure_main_window(app);
    }
    let _ = app.emit_to(MAIN_WINDOW, &format!("menu-{id}"), ());
}
