// Opens documents, picks the right viewer, keeps the view in sync with the
// file on disk, guards unsaved changes, and updates the window title.

import { backend } from "./backend.js";
import { basename, dirname, extname } from "./paths.js";
import { viewerFor } from "./viewers/index.js";

const RELOAD_DEBOUNCE_MS = 150;

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
    this.dirty = false;
    this.reloadTimer = null;
    this.suppressUntil = 0;
    this.changedOnDisk = false;
    this.openSeq = 0;
  }

  get name() {
    return this.path ? basename(this.path) : "";
  }

  async open(path) {
    const def = viewerFor(extname(path));
    if (!def) {
      this.showStatus(`Unsupported file type: ${basename(path)}`, "error");
      return false;
    }
    // Re-opening the current document (e.g. double clicking it again) must
    // never throw away unsaved work.
    if (path === this.path && this.dirty) return true;
    if (!(await this.confirmDiscard())) return false;

    const seq = ++this.openSeq;
    const { viewport, welcome } = this.els;
    const oldContainer = this.els.container;
    const oldViewerId = viewport.dataset.viewer;

    const container = document.createElement("article");
    container.className = "document";
    viewport.dataset.viewer = def.id;
    oldContainer.hidden = true;
    welcome.hidden = true;
    viewport.append(container);

    const viewer = def.create();
    try {
      await viewer.mount(container, path, this.makeContext(path, viewer));
    } catch (err) {
      console.error(err);
      viewer.unmount?.();
      container.remove();
      if (seq === this.openSeq) {
        viewport.dataset.viewer = oldViewerId ?? "";
        if (this.viewer) oldContainer.hidden = false;
        else welcome.hidden = false;
        this.showStatus(String(err?.message ?? err), "error");
      }
      return false;
    }
    if (seq !== this.openSeq) {
      viewer.unmount?.();
      container.remove();
      return false;
    }

    this.viewer?.unmount?.();
    oldContainer.remove();
    container.id = "document";
    this.els.container = container;
    this.viewer = viewer;
    this.dirty = false;
    this.changedOnDisk = false;
    await this.setPath(path);
    return true;
  }

  makeContext(path, viewer) {
    const isCurrent = () => this.viewer === viewer;
    return {
      backend,
      viewport: this.els.viewport,
      baseDir: dirname(path),
      openPath: (p) => this.open(p),
      showStatus: this.showStatus,
      setDirty: (dirty) => {
        if (!isCurrent() || this.dirty === dirty) return;
        this.dirty = dirty;
        this.updateTitle();
      },
      suppressReload: (ms = 2000) => {
        this.suppressUntil = Date.now() + ms;
      },
      pathChanged: (newPath) => isCurrent() && this.setPath(newPath),
      /** Before saving: if another app changed the file, ask first. */
      confirmOverwrite: async () => {
        if (!this.changedOnDisk) return true;
        const ok = await backend.confirm(
          `“${this.name}” was changed by another application since you opened it. Overwrite it with your version?`,
          { ok: "Overwrite", cancel: "Cancel" },
        );
        if (ok) this.changedOnDisk = false;
        return ok;
      },
    };
  }

  async setPath(path) {
    this.path = path;
    this.els.fileName.textContent = basename(path);
    this.els.fileName.title = path;
    this.updateTitle();
    try {
      await backend.watchFile(path);
    } catch (err) {
      console.warn("Could not watch file", err);
    }
  }

  updateTitle() {
    if (!this.path) return;
    const name = basename(this.path);
    this.els.fileName.classList.toggle("dirty", this.dirty);
    backend.setTitle(`${this.dirty ? "• " : ""}${name} — Readmark`);
  }

  /**
   * If there are unsaved changes, ask whether to save them.
   * Resolves true when it is OK to continue (saved or discarded).
   */
  async confirmDiscard() {
    if (!this.viewer || !this.dirty) return true;
    const answer = await backend.askUnsaved(this.name);
    if (answer === "cancel") return false;
    if (answer === "save") return (await this.viewer.save?.()) ?? false;
    return true;
  }

  /** Called when the backend reports a change to the open file on disk. */
  fileChanged() {
    if (!this.viewer) return;
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      if (Date.now() < this.suppressUntil) return; // our own save
      if (this.dirty) {
        // Never overwrite unsaved work with the version on disk.
        if (!this.changedOnDisk) {
          this.showStatus(`“${this.name}” changed on disk. Not reloading: you have unsaved changes.`, "error");
        }
        this.changedOnDisk = true;
        return;
      }
      this.changedOnDisk = false;
      this.viewer.reload().catch(() => {
        // During atomic saves the file can briefly be missing; ignore quietly.
      });
    }, RELOAD_DEBOUNCE_MS);
  }

  /** Forward a command to the viewer. Returns true when handled. */
  command(name) {
    return this.viewer?.command?.(name) ?? false;
  }

  async save() {
    if (!this.viewer?.save) return false;
    return this.viewer.save();
  }

  async saveAs() {
    if (!this.viewer?.saveAs) return false;
    return this.viewer.saveAs();
  }
}
