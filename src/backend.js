// Thin wrapper around everything that talks to the Tauri backend, so the rest
// of the frontend does not depend on Tauri APIs directly.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

export const backend = {
  /** Signal readiness; returns files requested before the UI was ready. */
  frontendReady: () => invoke("frontend_ready"),

  /** @returns {Promise<{path: string, content: string}>} */
  readTextFile: (path) => invoke("read_text_file", { path }),

  /** @returns {Promise<Uint8Array>} */
  readBinaryFile: async (path) => new Uint8Array(await invoke("read_binary_file", { path })),

  /** Atomically write bytes to a file. */
  writeBinaryFile: (path, bytes) =>
    invoke("write_binary_file", bytes, { headers: { path: encodeURIComponent(path) } }),

  /** Create `name.backup.ext` next to the file if it doesn't exist yet. */
  backupFile: (path) => invoke("backup_file", { path }),

  userName: () => invoke("user_name"),
  quit: () => invoke("quit_app"),

  watchFile: (path) => invoke("watch_file", { path }),
  unwatchFile: () => invoke("unwatch_file"),

  /** Convert an absolute local path into a URL the webview can load. */
  fileUrl: (path) => convertFileSrc(path),

  openExternal: (url) => openUrl(url),

  setTitle: (title) => {
    document.title = title;
    return getCurrentWindow().setTitle(title);
  },

  pickFile: (filters) => openDialog({ multiple: false, directory: false, filters }),
  pickSavePath: (defaultPath, filters) => saveDialog({ defaultPath, filters }),

  /** Ask what to do with unsaved changes. Resolves "save" | "discard" | "cancel". */
  askUnsaved: async (name) => {
    const result = await message(`Do you want to save the changes you made to “${name}”?`, {
      title: "Unsaved changes",
      kind: "warning",
      buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
    });
    if (result === "Save" || result === "Yes") return "save";
    if (result === "Don't Save" || result === "No") return "discard";
    return "cancel";
  },

  /** Yes/no question. Resolves true for the confirm button. */
  confirm: async (text, { title = "Readmark", ok = "OK", cancel = "Cancel", kind = "warning" } = {}) => {
    const result = await message(text, { title, kind, buttons: { ok, cancel } });
    return result === ok || result === "Ok";
  },

  onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),

  onOpenFiles: (handler) => listen("open-files", (e) => handler(e.payload)),
  onFileChanged: (handler) => listen("file-changed", (e) => handler(e.payload)),
  onMenu: (id, handler) => listen(`menu-${id}`, handler),

  /** handler({ type: "enter" | "over" | "drop" | "leave", paths?: string[] }) */
  onDragDrop: (handler) => getCurrentWebview().onDragDropEvent((e) => handler(e.payload)),
};
