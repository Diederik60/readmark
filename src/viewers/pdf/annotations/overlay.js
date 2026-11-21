// Draws highlights and note icons on top of the pdf.js pages.
//
// pdf.js removes unknown children of a page div when it re-renders a page,
// so a MutationObserver re-attaches our layers. Positions are percentages of
// the page box, so they follow zooming without recalculation.

import { el, icons } from "../dom.js";
import { cssColor } from "./model.js";
import { pageGeometry, pdfPointToPercent, pdfRectToPercent } from "./geometry.js";

export class AnnotationOverlay {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.viewerEl   the .pdfViewer element
   * @param {object} opts.pdfViewer
   * @param {import("./model.js").AnnotationStore} opts.store
   * @param {(id: string, anchor: Element) => void} opts.onActivate
   * @param {(id: string, point: number[]) => void} opts.onMoveNote
   */
  constructor({ viewerEl, pdfViewer, store, onActivate, onMoveNote }) {
    this.viewerEl = viewerEl;
    this.pdfViewer = pdfViewer;
    this.store = store;
    this.onActivate = onActivate;
    this.onMoveNote = onMoveNote;
    this.selectedId = null;

    this.observer = new MutationObserver((records) => {
      const pages = new Set();
      for (const rec of records) {
        const target = rec.target;
        if (target.classList?.contains("page")) pages.add(target);
        else if (target === viewerEl) viewerEl.querySelectorAll(":scope > .page").forEach((p) => pages.add(p));
      }
      for (const page of pages) if (!page.querySelector(":scope > .rm-hl-layer")) this.renderPage(page);
    });
    this.observer.observe(viewerEl, { childList: true, subtree: true });

    store.addEventListener("change", (e) => {
      const { type, annotation } = e.detail;
      if (type === "load") this.renderAll();
      else this.renderPageIndex(annotation.pageIndex);
    });
  }

  destroy() {
    this.observer.disconnect();
  }

  pageDiv(pageIndex) {
    return this.viewerEl.querySelector(`:scope > .page[data-page-number="${pageIndex + 1}"]`);
  }

  renderAll() {
    this.viewerEl.querySelectorAll(":scope > .page").forEach((p) => this.renderPage(p));
  }

  renderPageIndex(pageIndex) {
    const div = this.pageDiv(pageIndex);
    if (div) this.renderPage(div);
  }

  renderPage(pageDiv) {
    const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
    const pageView = this.pdfViewer.getPageView(pageIndex);
    if (!pageView) return;
    const viewport = pageView.viewport;

    let hl = pageDiv.querySelector(":scope > .rm-hl-layer");
    let notes = pageDiv.querySelector(":scope > .rm-note-layer");
    if (!hl) {
      hl = el("div.rm-hl-layer");
      notes = el("div.rm-note-layer");
      // Pause observing our own insertions.
      pageDiv.append(hl, notes);
    }
    hl.replaceChildren();
    notes.replaceChildren();

    for (const a of this.store.forPage(pageIndex)) {
      const selected = a.id === this.selectedId;
      if (a.type === "highlight") {
        for (const rect of a.rects) {
          const p = pdfRectToPercent(viewport, rect);
          hl.append(
            el("div.rm-hl", {
              dataset: { id: a.id },
              style: `left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%;background:${cssColor(a.color)}`,
              class: `rm-hl${selected ? " selected" : ""}`,
            }),
          );
        }
        if (a.comment) {
          // Small comment marker at the end of the first line.
          const first = a.rects.reduce((best, r) => (r[3] > best[3] ? r : best), a.rects[0]);
          const p = pdfRectToPercent(viewport, first);
          notes.append(this.#marker(a, `left:calc(${p.left + p.width}% - 6px);top:calc(${p.top}% - 12px)`, "rm-comment-marker"));
        }
      } else if (a.type === "note") {
        const p = pdfPointToPercent(viewport, a.point);
        const icon = this.#marker(a, `left:${p.left}%;top:${p.top}%`, "rm-note");
        icon.style.color = cssColor(a.color);
        this.#makeDraggable(icon, a, pageView);
        notes.append(icon);
      }
    }
  }

  #marker(a, style, cls) {
    return el(
      `button.${cls}${a.id === this.selectedId ? ".selected" : ""}`,
      {
        type: "button",
        title: a.comment ? a.comment.slice(0, 200) : a.type === "note" ? "Note" : "Comment",
        style,
        dataset: { id: a.id },
        html: cls === "rm-note" ? icons.bubble : "",
        onclick: (e) => {
          e.stopPropagation();
          if (e.currentTarget.dataset.dragged) {
            delete e.currentTarget.dataset.dragged;
            return;
          }
          this.onActivate(a.id, e.currentTarget);
        },
        onmousedown: (e) => e.stopPropagation(),
      },
    );
  }

  #makeDraggable(icon, a, pageView) {
    icon.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const start = [e.clientX, e.clientY];
      const origin = icon.getBoundingClientRect();
      let moved = false;
      icon.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start[0];
        const dy = ev.clientY - start[1];
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        icon.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      const up = (ev) => {
        icon.removeEventListener("pointermove", move);
        icon.removeEventListener("pointerup", up);
        icon.removeEventListener("pointercancel", up);
        if (!moved) return;
        icon.dataset.dragged = "1";
        const geom = pageGeometry(pageView);
        const point = geom.toPdf(origin.left + ev.clientX - start[0], origin.top + ev.clientY - start[1]);
        this.onMoveNote(a.id, point);
      };
      icon.addEventListener("pointermove", move);
      icon.addEventListener("pointerup", up);
      icon.addEventListener("pointercancel", up);
    });
  }

  setSelected(id) {
    const prev = this.selectedId ? this.store.get(this.selectedId) : null;
    this.selectedId = id;
    if (prev) this.renderPageIndex(prev.pageIndex);
    const next = id ? this.store.get(id) : null;
    if (next && next.pageIndex !== prev?.pageIndex) this.renderPageIndex(next.pageIndex);
  }

  /** Highlight under a client point, if any (topmost = last drawn). */
  hitTest(pageDiv, clientX, clientY) {
    const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
    const pageView = this.pdfViewer.getPageView(pageIndex);
    if (!pageView) return null;
    const [x, y] = pageGeometry(pageView).toPdf(clientX, clientY);
    const hits = this.store
      .forPage(pageIndex)
      .filter((a) => a.type === "highlight" && a.rects.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]));
    return hits.at(-1)?.id ?? null;
  }

  /** Briefly pulse an annotation after jumping to it. */
  flash(id) {
    const a = this.store.get(id);
    const div = a && this.pageDiv(a.pageIndex);
    div?.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((node) => {
      node.classList.remove("flash");
      void node.offsetWidth;
      node.classList.add("flash");
    });
  }

  /** Client rect of an annotation (for anchoring popovers). */
  anchorRect(id) {
    const a = this.store.get(id);
    const div = a && this.pageDiv(a.pageIndex);
    const nodes = div ? [...div.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)] : [];
    if (!nodes.length) return null;
    const rects = nodes.map((n) => n.getBoundingClientRect());
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  }
}
