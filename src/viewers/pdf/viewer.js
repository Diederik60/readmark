// The PDF viewer: pdf.js rendering plus Readmark's annotation tools.

import "../../styles/pdf.css";
import { basename, dirname } from "../../paths.js";
import { el, icons } from "./dom.js";
import { documentParams, loadPdfjs } from "./pdfjs.js";
import { SearchBar } from "./search.js";
import { Thumbnails } from "./thumbnails.js";
import { AnnotationStore, COLORS, NOTE_COLOR, cssColor, newId } from "./annotations/model.js";
import { loadAnnotatedPdf, saveAnnotatedPdf } from "./annotations/pdf-io.js";
import { pageGeometry, selectionToPdfRects, textInRects } from "./annotations/geometry.js";
import { AnnotationOverlay } from "./annotations/overlay.js";
import { AnnotationEditor, SelectionToolbar } from "./annotations/popover.js";
import { CommentsPanel } from "./annotations/panel.js";

// Files that already got a backup during this session.
const backedUp = new Set();

const PREFS_KEY = "readmark.pdf.prefs";
function loadPrefs() {
  try {
    return { thumbnails: window.innerWidth > 900, comments: true, color: "yellow", ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { thumbnails: window.innerWidth > 900, comments: true, color: "yellow" };
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

export class PdfDocumentViewer {
  async mount(container, path, ctx) {
    this.container = container;
    this.path = path;
    this.ctx = ctx;
    this.prefs = loadPrefs();
    this.abort = new AbortController();
    this.store = new AnnotationStore();
    this.textCache = new Map();
    this.noteMode = false;

    this.lib = await loadPdfjs();
    this.#buildLayout();
    this.#setupPdfjs();
    this.#setupAnnotations();
    this.#bindEvents();
    this.author = await ctx.backend.userName().catch(() => "");
    await this.#load({ keepView: false });
  }

  // -------------------------------------------------------------------------
  // Layout

  #buildLayout() {
    const btn = (title, html, onclick, cls = "") =>
      el(`button.rm-tool${cls}`, { type: "button", title, html, onclick });

    this.pageInput = el("input.rm-page-input", {
      type: "text",
      inputMode: "numeric",
      title: "Page number",
      onchange: () => this.#goToPage(Number(this.pageInput.value)),
      onkeydown: (e) => {
        if (e.key === "Enter") this.pageInput.blur();
      },
    });
    this.pageCount = el("span.rm-page-count");
    this.zoomLabel = el("button.rm-tool.rm-zoom-label", { type: "button", title: "Fit to width", onclick: () => this.command("zoom-fit") });

    this.colorButtons = Object.entries(COLORS).map(([name, rgb]) =>
      el("button.rm-swatch.rm-tool-swatch", {
        type: "button",
        title: `Highlight ${name}`,
        style: `--swatch:${cssColor(rgb)}`,
        dataset: { color: name },
        onmousedown: (e) => e.preventDefault(),
        onclick: () => this.#pickColor(name),
      }),
    );
    this.noteButton = btn("Add a sticky note (click on the page to place it)", icons.note, () => this.#setNoteMode(!this.noteMode));
    this.thumbButton = btn("Thumbnails", icons.sidebar, () => this.#togglePanel("thumbnails"));
    this.commentsButton = btn("Highlights and comments", icons.comments, () => this.#togglePanel("comments"));
    this.commentsBadge = el("span.rm-badge");
    this.commentsButton.append(this.commentsBadge);
    this.saveButton = btn("Save (annotations are written into the PDF)", `${icons.save}<span>Save</span>`, () => this.save(), ".rm-save");
    this.saveButton.disabled = true;

    const toolbar = el("div.rm-pdf-toolbar", {}, [
      el("div.rm-group", {}, [this.thumbButton]),
      el("div.rm-group", {}, [
        btn("Previous page", icons.up, () => this.pdfViewer.previousPage()),
        btn("Next page", icons.down, () => this.pdfViewer.nextPage()),
        this.pageInput,
        this.pageCount,
      ]),
      el("div.rm-group", {}, [
        btn("Zoom out", icons.minus, () => this.command("zoom-out")),
        this.zoomLabel,
        btn("Zoom in", icons.plus, () => this.command("zoom-in")),
        btn("Fit to width", icons.fit, () => this.command("zoom-fit")),
      ]),
      el("div.rm-group.rm-annotate-tools", {}, [...this.colorButtons, this.noteButton]),
      el("div.rm-spacer"),
      el("div.rm-group", {}, [btn("Find", icons.search, () => this.command("find")), this.commentsButton, this.saveButton]),
    ]);

    this.searchNode = el("div.rm-search", { hidden: true });
    this.thumbsNode = el("aside.rm-thumbs");
    this.panelNode = el("aside.rm-comments");
    this.viewerEl = el("div.pdfViewer");
    this.scrollEl = el("div.rm-pdf-scroll", {}, [this.viewerEl]);
    this.mainEl = el("div.rm-pdf-main", {}, [this.scrollEl, this.searchNode]);

    this.root = el("div.rm-pdf", {}, [toolbar, el("div.rm-pdf-body", {}, [this.thumbsNode, this.mainEl, this.panelNode])]);
    this.container.classList.add("pdf-document");
    this.container.replaceChildren(this.root);
    this.#applyPanels();
    this.#updateColorButtons();
  }

  #applyPanels() {
    this.root.classList.toggle("show-thumbs", !!this.prefs.thumbnails);
    this.root.classList.toggle("show-comments", !!this.prefs.comments);
    this.thumbButton.classList.toggle("active", !!this.prefs.thumbnails);
    this.commentsButton.classList.toggle("active", !!this.prefs.comments);
  }

  #togglePanel(name) {
    this.prefs[name] = !this.prefs[name];
    savePrefs(this.prefs);
    this.#applyPanels();
    if (name === "thumbnails" && this.prefs.thumbnails) this.thumbnails?.setCurrent(this.pdfViewer.currentPageNumber);
    // The viewer width changed; keep "fit to width" fitting.
    setTimeout(() => {
      const value = this.pdfViewer.currentScaleValue;
      if (value === "page-width" || value === "page-fit" || value === "auto") this.pdfViewer.currentScaleValue = value;
    });
  }

  // -------------------------------------------------------------------------
  // pdf.js

  #setupPdfjs() {
    const { EventBus, PDFViewer, PDFLinkService, PDFFindController, LinkTarget, pdfjsLib } = this.lib;
    this.eventBus = new EventBus();
    this.linkService = new PDFLinkService({ eventBus: this.eventBus, externalLinkTarget: LinkTarget.BLANK });
    this.findController = new PDFFindController({ eventBus: this.eventBus, linkService: this.linkService });
    this.pdfViewer = new PDFViewer({
      container: this.scrollEl,
      viewer: this.viewerEl,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE,
      annotationEditorMode: pdfjsLib.AnnotationEditorType.DISABLE,
      removePageBorders: false,
    });
    this.linkService.setViewer(this.pdfViewer);

    this.eventBus.on("pagechanging", ({ pageNumber }) => {
      this.pageInput.value = String(pageNumber);
      this.thumbnails?.setCurrent(pageNumber);
    });
    this.eventBus.on("scalechanging", ({ scale }) => {
      this.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    });

    this.search = new SearchBar(this.searchNode, this.eventBus);
    this.thumbnails = new Thumbnails(this.thumbsNode, { onSelect: (n) => this.#goToPage(n) });
  }

  async #load({ keepView }) {
    const { pdfjsLib } = this.lib;
    const bytes = await this.ctx.backend.readBinaryFile(this.path);
    const { annotations, displayBytes, editable, reason } = await loadAnnotatedPdf(bytes.slice());

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: displayBytes.slice(), ...documentParams() }).promise;
    } catch (err) {
      if (err?.name === "PasswordException") throw new Error("Password-protected PDFs aren't supported yet.");
      throw new Error(`Could not open PDF: ${err?.message ?? err}`);
    }

    const view = keepView && this.pdf
      ? { scale: this.pdfViewer.currentScaleValue, top: this.scrollEl.scrollTop, left: this.scrollEl.scrollLeft }
      : null;
    const old = this.pdf;

    this.originalBytes = bytes;
    this.editable = editable;
    this.pdf = pdf;
    this.textCache.clear();
    this.root.classList.toggle("read-only", !editable);
    if (!editable && reason) this.ctx.showStatus(reason, "error");

    const initialized = new Promise((resolve) => this.eventBus.on("pagesinit", resolve, { once: true }));
    this.pdfViewer.setDocument(pdf);
    this.linkService.setDocument(pdf, null);
    this.store.load(annotations);
    this.pageCount.textContent = `of ${pdf.numPages}`;
    this.thumbnails.setDocument(pdf);
    await initialized;

    if (view) {
      this.pdfViewer.currentScaleValue = view.scale;
      this.scrollEl.scrollTop = view.top;
      this.scrollEl.scrollLeft = view.left;
    } else {
      this.pdfViewer.currentScaleValue = "page-width";
    }
    this.pageInput.value = String(this.pdfViewer.currentPageNumber);
    old?.destroy();
  }

  async reload() {
    await this.#load({ keepView: true });
  }

  #goToPage(n) {
    if (!this.pdf) return;
    const page = Math.min(Math.max(1, Math.round(n) || 1), this.pdf.numPages);
    this.pdfViewer.currentPageNumber = page;
    this.pageInput.value = String(page);
  }

  // -------------------------------------------------------------------------
  // Annotations

  #setupAnnotations() {
    this.overlay = new AnnotationOverlay({
      viewerEl: this.viewerEl,
      pdfViewer: this.pdfViewer,
      store: this.store,
      onActivate: (id, anchorEl) => this.#openEditor(id, anchorEl.getBoundingClientRect()),
      onMoveNote: (id, point) => this.store.update(id, { point }),
    });
    this.selectionBar = new SelectionToolbar(this.root, {
      onHighlight: (color, withComment) => this.#highlightSelection(color, withComment),
    });
    this.editor = new AnnotationEditor(this.root, {
      store: this.store,
      onDelete: (id) => this.#deleteAnnotation(id),
      onClose: () => this.#select(null),
    });
    this.panel = new CommentsPanel(this.panelNode, {
      store: this.store,
      onJump: (id) => this.#jumpTo(id),
      onEdit: (id) => this.#jumpTo(id, { edit: true }),
      onDelete: (id) => this.#deleteAnnotation(id),
      getText: (a) => this.#textForHighlight(a),
    });

    this.store.addEventListener("dirty", (e) => {
      this.ctx.setDirty(e.detail);
      this.saveButton.disabled = !e.detail;
    });
    this.store.addEventListener("change", () => {
      const n = this.store.size;
      this.commentsBadge.textContent = n ? String(n) : "";
    });
  }

  #pickColor(name) {
    this.prefs.color = name;
    savePrefs(this.prefs);
    this.#updateColorButtons();
    // With text selected, the color buttons highlight immediately.
    if (this.#hasTextSelection()) this.#highlightSelection(name, false);
  }

  #updateColorButtons() {
    this.colorButtons.forEach((b) => b.classList.toggle("active", b.dataset.color === this.prefs.color));
  }

  #hasTextSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    return this.viewerEl.contains(node.nodeType === 1 ? node : node.parentNode);
  }

  #requireEditable() {
    if (this.editable) return true;
    this.ctx.showStatus("This PDF can't be annotated.", "error");
    return false;
  }

  #highlightSelection(colorName, withComment) {
    if (!this.#requireEditable()) return;
    const selection = window.getSelection();
    const parts = selectionToPdfRects(selection, (i) => this.pdfViewer.getPageView(i));
    this.selectionBar.hide();
    if (!parts.length) return;
    selection.removeAllRanges();
    this.prefs.color = colorName;
    savePrefs(this.prefs);
    this.#updateColorButtons();

    const now = new Date();
    const created = parts.map(({ pageIndex, rects, text }) =>
      this.store.add({
        id: newId(),
        type: "highlight",
        pageIndex,
        rects,
        text,
        color: COLORS[colorName],
        comment: "",
        author: this.author,
        created: now,
        modified: now,
      }),
    );
    if (withComment) {
      const last = created.at(-1);
      setTimeout(() => this.#openEditor(last.id, this.overlay.anchorRect(last.id), { focus: true }));
    }
  }

  #setNoteMode(on) {
    if (on && !this.#requireEditable()) return;
    this.noteMode = on;
    this.noteButton.classList.toggle("active", on);
    this.root.classList.toggle("note-mode", on);
    if (on) this.ctx.showStatus("Click on a page to place a note. Esc cancels.");
  }

  #placeNote(pageDiv, clientX, clientY) {
    const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
    const pageView = this.pdfViewer.getPageView(pageIndex);
    const point = pageGeometry(pageView).toPdf(clientX - 4, clientY - 4);
    const now = new Date();
    const note = this.store.add({
      id: newId(),
      type: "note",
      pageIndex,
      point,
      color: NOTE_COLOR,
      comment: "",
      author: this.author,
      created: now,
      modified: now,
    });
    this.#setNoteMode(false);
    setTimeout(() => this.#openEditor(note.id, this.overlay.anchorRect(note.id), { focus: true, isNew: true }));
  }

  #openEditor(id, anchor, opts = {}) {
    if (!anchor) return;
    this.selectionBar.hide();
    this.#select(id);
    this.editor.open(id, anchor, opts);
  }

  #select(id) {
    this.overlay.setSelected(id);
    this.panel.setSelected(id);
  }

  #deleteAnnotation(id) {
    if (this.editor.openId === id) this.editor.hide();
    if (this.overlay.selectedId === id) this.#select(null);
    this.store.remove(id);
  }

  #jumpTo(id, { edit = false } = {}) {
    const a = this.store.get(id);
    if (!a) return;
    const x = a.type === "note" ? a.point[0] : Math.min(...a.rects.map((r) => r[0]));
    const y = a.type === "note" ? a.point[1] : Math.max(...a.rects.map((r) => r[3]));
    this.pdfViewer.scrollPageIntoView({
      pageNumber: a.pageIndex + 1,
      destArray: [null, { name: "XYZ" }, Math.max(0, x - 40), y + 60, null],
      ignoreDestinationZoom: true,
    });
    this.#select(id);
    // Wait for the page to be laid out at its new position.
    setTimeout(() => {
      this.overlay.flash(id);
      if (edit) this.#openEditor(id, this.overlay.anchorRect(id), { focus: true });
    }, 120);
  }

  async #textForHighlight(a) {
    if (a.text != null) return a.text;
    try {
      let content = this.textCache.get(a.pageIndex);
      if (!content) {
        const page = await this.pdf.getPage(a.pageIndex + 1);
        content = await page.getTextContent();
        this.textCache.set(a.pageIndex, content);
      }
      a.text = textInRects(content, a.rects);
    } catch {
      a.text = "";
    }
    return a.text;
  }

  // -------------------------------------------------------------------------
  // Events

  #bindEvents() {
    const signal = this.abort.signal;

    // Mouse up in the page area: show the selection toolbar, place a note,
    // or open the highlight under the pointer.
    this.scrollEl.addEventListener(
      "mouseup",
      (e) => {
        if (e.button !== 0) return;
        const pageDiv = e.target.closest?.(".page");
        if (this.noteMode) {
          if (pageDiv) this.#placeNote(pageDiv, e.clientX, e.clientY);
          return;
        }
        // Let the selection settle first.
        setTimeout(() => {
          if (this.#hasTextSelection()) {
            if (!this.editable) return;
            const range = window.getSelection().getRangeAt(0);
            const rects = [...range.getClientRects()].filter((r) => r.width > 0);
            const last = rects.at(-1) ?? range.getBoundingClientRect();
            this.editor.close();
            this.selectionBar.show(last, this.prefs.color);
            return;
          }
          if (!pageDiv || e.target.closest("a, .annotationLayer section")) return;
          const id = this.overlay.hitTest(pageDiv, e.clientX, e.clientY);
          if (id) this.#openEditor(id, this.overlay.anchorRect(id));
        }, 0);
      },
      { signal },
    );

    // Clicking elsewhere closes popovers.
    document.addEventListener(
      "mousedown",
      (e) => {
        if (this.editor.contains(e.target) || this.selectionBar.contains(e.target)) return;
        this.selectionBar.hide();
        if (this.editor.openId) this.editor.close();
      },
      { signal, capture: true },
    );

    document.addEventListener(
      "selectionchange",
      () => {
        if (!this.#hasTextSelection()) this.selectionBar.hide();
      },
      { signal },
    );

    document.addEventListener(
      "keydown",
      (e) => {
        const typing = e.target.closest?.("input, textarea, [contenteditable]");
        if (e.key === "Escape") {
          if (this.noteMode) this.#setNoteMode(false);
          else if (this.editor.openId) this.editor.close();
          else if (this.search.isOpen) this.search.close();
          this.selectionBar.hide();
        } else if ((e.key === "Delete" || e.key === "Backspace") && !typing && this.overlay.selectedId) {
          e.preventDefault();
          this.#deleteAnnotation(this.overlay.selectedId);
        }
      },
      { signal },
    );

    // Pinch / Ctrl+wheel zoom around the pointer.
    this.scrollEl.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const scaleFactor = Math.exp(-e.deltaY / 200);
        this.pdfViewer.updateScale({ scaleFactor, origin: [e.clientX, e.clientY] });
      },
      { signal, passive: false },
    );

    // Keep "fit to width" fitting when the window is resized.
    const resize = new ResizeObserver(() => {
      const value = this.pdfViewer.currentScaleValue;
      if (value === "page-width" || value === "page-fit" || value === "auto") this.pdfViewer.currentScaleValue = value;
    });
    resize.observe(this.scrollEl);
    signal.addEventListener("abort", () => resize.disconnect());
  }

  // -------------------------------------------------------------------------
  // Commands

  command(name) {
    switch (name) {
      case "find":
        this.search.open();
        return true;
      case "zoom-in":
        this.pdfViewer.increaseScale();
        return true;
      case "zoom-out":
        this.pdfViewer.decreaseScale();
        return true;
      case "zoom-fit":
        this.pdfViewer.currentScaleValue = "page-width";
        return true;
      case "print":
        this.ctx.showStatus("Printing PDFs isn't supported in Readmark yet. Save, then print from Preview or your PDF reader.", "error");
        return true;
      default:
        return false;
    }
  }

  isDirty() {
    return this.store.dirty;
  }

  async #serialize() {
    this.editor.commit();
    return saveAnnotatedPdf(this.originalBytes, this.store.all());
  }

  async save() {
    if (!this.#requireEditable()) return false;
    if (!this.store.dirty) {
      this.ctx.showStatus("No changes to save");
      return true;
    }
    if (!(await this.ctx.confirmOverwrite())) return false;
    try {
      if (!backedUp.has(this.path)) {
        const backup = await this.ctx.backend.backupFile(this.path);
        backedUp.add(this.path);
        this.ctx.showStatus(`Backup kept as ${basename(backup)}`);
      }
      const bytes = await this.#serialize();
      this.ctx.suppressReload(3000);
      await this.ctx.backend.writeBinaryFile(this.path, bytes);
      this.originalBytes = bytes;
      this.store.markSaved();
      this.ctx.showStatus(`Saved ${basename(this.path)}`);
      return true;
    } catch (err) {
      this.ctx.showStatus(`Save failed: ${err?.message ?? err}`, "error");
      return false;
    }
  }

  async saveAs() {
    if (!this.#requireEditable()) return false;
    const stem = basename(this.path).replace(/\.pdf$/i, "");
    const sep = this.path.includes("\\") ? "\\" : "/";
    const target = await this.ctx.backend.pickSavePath(`${dirname(this.path)}${sep}${stem} (annotated).pdf`, [
      { name: "PDF", extensions: ["pdf"] },
    ]);
    if (!target) return false;
    if (target === this.path) return this.save();
    try {
      const bytes = await this.#serialize();
      this.ctx.suppressReload(3000);
      await this.ctx.backend.writeBinaryFile(target, bytes);
      this.originalBytes = bytes;
      this.path = target;
      this.store.markSaved();
      await this.ctx.pathChanged(target);
      this.ctx.showStatus(`Saved as ${basename(target)}`);
      return true;
    } catch (err) {
      this.ctx.showStatus(`Save failed: ${err?.message ?? err}`, "error");
      return false;
    }
  }

  unmount() {
    this.abort?.abort();
    this.overlay?.destroy();
    this.thumbnails?.destroy();
    this.pdf?.destroy();
    this.pdf = null;
  }
}
