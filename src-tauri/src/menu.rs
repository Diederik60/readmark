//! Native menu bar (macOS). Windows uses the in-window toolbar instead.

use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Runtime,
};

use crate::documents::{ensure_main_window, MAIN_WINDOW};

pub const MENU_OPEN: &str = "open";
pub const MENU_PRINT: &str = "print";

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
        .quit()
        .build()?;

    let open = MenuItemBuilder::with_id(MENU_OPEN, "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let print = MenuItemBuilder::with_id(MENU_PRINT, "Print…")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open)
        .separator()
        .item(&print)
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
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()
}

pub fn handle_event(app: &AppHandle, id: &str) {
    match id {
        MENU_OPEN => {
            ensure_main_window(app);
            let _ = app.emit_to(MAIN_WINDOW, "menu-open", ());
        }
        MENU_PRINT => {
            let _ = app.emit_to(MAIN_WINDOW, "menu-print", ());
        }
        _ => {}
    }
}
