// Page thumbnails, rendered lazily when they scroll into view.

import { el } from "./dom.js";

const THUMB_WIDTH = 112;

export class Thumbnails {
  constructor(node, { onSelect }) {
    this.node = node;
    this.onSelect = onSelect;
    this.pdf = null;
    this.items = [];
    this.queue = [];
    this.rendering = false;
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) this.#enqueue(Number(entry.target.dataset.index));
      }
    }, { root: node, rootMargin: "300px 0px" });
  }

  async setDocument(pdf) {
    this.pdf = pdf;
    this.queue = [];
    this.items.forEach((i) => this.observer.unobserve(i.node));
    const first = await pdf.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    const ratio = vp.height / vp.width;
    this.items = Array.from({ length: pdf.numPages }, (_, index) => {
      const canvasBox = el("div.rm-thumb-canvas", { style: `width:${THUMB_WIDTH}px;height:${THUMB_WIDTH * ratio}px` });
      const node = el(
        "button.rm-thumb",
        { type: "button", dataset: { index }, title: `Page ${index + 1}`, onclick: () => this.onSelect(index + 1) },
        [canvasBox, el("span.rm-thumb-label", {}, String(index + 1))],
      );
      return { node, canvasBox, rendered: false };
    });
    this.node.replaceChildren(...this.items.map((i) => i.node));
    this.items.forEach((i) => this.observer.observe(i.node));
  }

  #enqueue(index) {
    const item = this.items[index];
    if (!item || item.rendered || this.queue.includes(index)) return;
    this.queue.push(index);
    this.#drain();
  }

  async #drain() {
    if (this.rendering) return;
    this.rendering = true;
    const pdf = this.pdf;
    while (this.queue.length && pdf === this.pdf) {
      const index = this.queue.shift();
      const item = this.items[index];
      if (!item || item.rendered) continue;
      try {
        const page = await pdf.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * dpr });
        const canvas = el("canvas", { width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
        await page.render({ canvas, viewport }).promise;
        if (pdf !== this.pdf) break;
        item.canvasBox.style.height = `${(THUMB_WIDTH * base.height) / base.width}px`;
        item.canvasBox.replaceChildren(canvas);
        item.rendered = true;
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") console.warn("Thumbnail failed", err);
      }
    }
    this.rendering = false;
  }

  setCurrent(pageNumber) {
    this.items.forEach((item, i) => item.node.classList.toggle("current", i === pageNumber - 1));
    const current = this.items[pageNumber - 1]?.node;
    if (current && this.node.offsetParent) current.scrollIntoView({ block: "nearest" });
  }

  destroy() {
    this.observer.disconnect();
    this.pdf = null;
  }
}
