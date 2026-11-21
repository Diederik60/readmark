// Opens documents, picks the right viewer, keeps the view in sync with the
// file on disk, and updates the window title.

import { backend } from "./backend.js";
import { basename, dirname, extname } from "./paths.js";
import { viewerFor } from "./viewers/index.js";

const RELOAD_DEBOUNCE_MS = 120;

export class DocumentController {
  /**
   * @param {object} els  { container, welcome, viewport, fileName }
   * @param {(msg: string, kind?: string) => void} showStatus
   */
  constructor(els, showStatus) {
    this.els = els;
    this.showStatus = showStatus;
    this.path = null;
    this.viewer = null;
    this.reloadTimer = null;
    this.renderSeq = 0;
  }

  async open(path) {
    const viewer = viewerFor(extname(path));
    if (!viewer) {
      this.showStatus(`Unsupported file type: ${basename(path)}`, "error");
      return;
    }
    const previous = { viewer: this.viewer, path: this.path };
    this.viewer = viewer;
    this.path = path;

    const ok = await this.render({ preserveScroll: false });
    if (!ok) {
      Object.assign(this, previous);
      return;
    }
    if (previous.viewer && previous.viewer !== viewer) previous.viewer.dispose?.();
    const name = basename(path);
    this.els.fileName.textContent = name;
    this.els.fileName.title = path;
    await backend.setTitle(`${name} — Readmark`);
    try {
      await backend.watchFile(path);
    } catch (err) {
      console.warn("Could not watch file", err);
    }
  }

  /** Called when the backend reports a change to `path` on disk. */
  fileChanged() {
    // The backend watches only the current document.
    if (!this.path) return;
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => this.render({ preserveScroll: true, quiet: true }), RELOAD_DEBOUNCE_MS);
  }

  async render({ preserveScroll, quiet = false }) {
    const seq = ++this.renderSeq;
    const { container, welcome, viewport } = this.els;
    const scroll = viewport.scrollTop;

    // Render off-screen first so a failed reload keeps the previous content.
    const staging = document.createElement("article");
    try {
      await this.viewer.render(staging, this.path, {
        backend,
        baseDir: dirname(this.path),
        openPath: (p) => this.open(p),
      });
    } catch (err) {
      // During atomic saves the file can briefly be missing; ignore quietly.
      if (!quiet) this.showStatus(String(err?.message ?? err), "error");
      return false;
    }
    if (seq !== this.renderSeq) return false; // a newer render won

    container.replaceWith(staging);
    staging.id = "document";
    this.els.container = staging;
    staging.hidden = false;
    welcome.hidden = true;
    viewport.scrollTop = preserveScroll ? scroll : 0;
    return true;
  }
}
