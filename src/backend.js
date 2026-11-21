// Thin wrapper around everything that talks to the Tauri backend, so the rest
// of the frontend does not depend on Tauri APIs directly.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

export const backend = {
  /** Signal readiness; returns files requested before the UI was ready. */
  frontendReady: () => invoke("frontend_ready"),

  /** @returns {Promise<{path: string, content: string}>} */
  readTextFile: (path) => invoke("read_text_file", { path }),

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

  onOpenFiles: (handler) => listen("open-files", (e) => handler(e.payload)),
  onFileChanged: (handler) => listen("file-changed", (e) => handler(e.payload)),
  onMenu: (id, handler) => listen(`menu-${id}`, handler),

  /** handler({ type: "enter" | "over" | "drop" | "leave", paths?: string[] }) */
  onDragDrop: (handler) => getCurrentWebview().onDragDropEvent((e) => handler(e.payload)),
};
