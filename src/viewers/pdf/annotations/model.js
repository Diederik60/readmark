// Annotation model. Coordinates are PDF user space (points, origin bottom
// left of the page), independent of zoom and rotation.
//
// Annotation {
//   id: string,                 // stored as /NM in the PDF
//   type: "highlight" | "note",
//   pageIndex: number,          // 0-based
//   color: [r, g, b],           // 0..1
//   rects?: [x1, y1, x2, y2][], // highlight: one rect per line (y1 < y2)
//   point?: [x, yTop],          // note: top-left corner of the icon
//   comment: string,
//   author: string,
//   created: Date, modified: Date,
//   text?: string,              // highlighted text (display only, not saved)
// }

export const COLORS = {
  yellow: [1, 0.86, 0.2],
  green: [0.55, 0.9, 0.4],
  blue: [0.47, 0.75, 1],
  pink: [1, 0.55, 0.78],
};

export const NOTE_COLOR = [1, 0.84, 0.25];

export function cssColor([r, g, b], alpha = 1) {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${alpha})`;
}

export function nearestColorName(rgb) {
  let best = "yellow";
  let bestDist = Infinity;
  for (const [name, c] of Object.entries(COLORS)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bestDist) [best, bestDist] = [name, d];
  }
  return best;
}

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Top edge in PDF space, used for sorting (higher = earlier on the page). */
export function annotationTop(a) {
  if (a.type === "note") return a.point[1];
  return Math.max(...a.rects.map((r) => r[3]));
}

export function annotationLeft(a) {
  if (a.type === "note") return a.point[0];
  return Math.min(...a.rects.map((r) => r[0]));
}

/**
 * Holds the annotations of one document and tracks unsaved changes.
 * Emits "change" ({ detail: { type, id } }) and "dirty" events.
 */
export class AnnotationStore extends EventTarget {
  constructor() {
    super();
    this.items = new Map();
    this.dirty = false;
  }

  load(list) {
    this.items = new Map(list.map((a) => [a.id, a]));
    this.#emit("load");
    this.#setDirty(false);
  }

  get(id) {
    return this.items.get(id);
  }

  get size() {
    return this.items.size;
  }

  /** All annotations in reading order. */
  all() {
    return [...this.items.values()].sort(
      (a, b) => a.pageIndex - b.pageIndex || annotationTop(b) - annotationTop(a) || annotationLeft(a) - annotationLeft(b),
    );
  }

  forPage(pageIndex) {
    return [...this.items.values()].filter((a) => a.pageIndex === pageIndex);
  }

  add(annotation) {
    this.items.set(annotation.id, annotation);
    this.#emit("add", annotation);
    this.#setDirty(true);
    return annotation;
  }

  update(id, patch, { silent = false } = {}) {
    const a = this.items.get(id);
    if (!a) return;
    Object.assign(a, patch);
    if (!silent) {
      a.modified = new Date();
      this.#setDirty(true);
    }
    this.#emit("update", a);
  }

  remove(id) {
    const a = this.items.get(id);
    if (!a) return;
    this.items.delete(id);
    this.#emit("remove", a);
    this.#setDirty(true);
  }

  markSaved() {
    this.#setDirty(false);
  }

  #emit(type, annotation = null) {
    this.dispatchEvent(new CustomEvent("change", { detail: { type, annotation } }));
  }

  #setDirty(dirty) {
    if (this.dirty === dirty) return;
    this.dirty = dirty;
    this.dispatchEvent(new CustomEvent("dirty", { detail: dirty }));
  }
}
