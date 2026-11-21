// Floating UI: the toolbar shown after selecting text, and the editor for a
// highlight or note (color, comment, delete).

import { el, icons } from "../dom.js";
import { COLORS, cssColor, nearestColorName } from "./model.js";

function place(node, anchor, { gap = 8 } = {}) {
  const { innerWidth: vw, innerHeight: vh } = window;
  node.style.visibility = "hidden";
  node.hidden = false;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let left = Math.min(Math.max(8, (anchor.left + anchor.right) / 2 - w / 2), vw - w - 8);
  let top = anchor.bottom + gap;
  if (top + h > vh - 8) top = Math.max(8, anchor.top - h - gap);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.visibility = "";
}

function swatches(current, onPick) {
  return el(
    "div.rm-swatches",
    {},
    Object.entries(COLORS).map(([name, rgb]) =>
      el(`button.rm-swatch${current === name ? ".active" : ""}`, {
        type: "button",
        title: name[0].toUpperCase() + name.slice(1),
        style: `--swatch:${cssColor(rgb)}`,
        dataset: { color: name },
        onmousedown: (e) => e.preventDefault(), // keep the text selection
        onclick: () => onPick(name),
      }),
    ),
  );
}

/** Toolbar that appears next to a text selection. */
export class SelectionToolbar {
  constructor(root, { onHighlight }) {
    this.node = el("div.rm-popover.rm-selection-bar", { hidden: true });
    this.onHighlight = onHighlight;
    root.append(this.node);
  }

  show(anchor, currentColor) {
    this.node.replaceChildren(
      swatches(currentColor, (color) => this.onHighlight(color, false)),
      el("button.rm-text-button", {
        type: "button",
        html: `${icons.comments}<span>Comment</span>`,
        title: "Highlight and add a comment",
        onmousedown: (e) => e.preventDefault(),
        onclick: () => this.onHighlight(currentColor, true),
      }),
    );
    place(this.node, anchor);
  }

  hide() {
    this.node.hidden = true;
  }

  contains(node) {
    return this.node.contains(node);
  }
}

/** Editor for one annotation. */
export class AnnotationEditor {
  constructor(root, { store, onClose, onDelete }) {
    this.root = root;
    this.store = store;
    this.onClose = onClose;
    this.onDelete = onDelete;
    this.node = el("div.rm-popover.rm-editor", { hidden: true });
    root.append(this.node);
    this.id = null;
    this.isNew = false;
    this.timer = null;
  }

  get openId() {
    return this.node.hidden ? null : this.id;
  }

  open(id, anchor, { focus = false, isNew = false } = {}) {
    this.commit();
    const a = this.store.get(id);
    if (!a) return;
    this.id = id;
    this.isNew = isNew;

    const textarea = el("textarea.rm-comment-input", {
      placeholder: a.type === "note" ? "Write a note…" : "Add a comment…",
      rows: 4,
      value: a.comment ?? "",
      oninput: () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.commit(), 400);
      },
      onkeydown: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          this.close();
        }
      },
    });
    this.textarea = textarea;

    const meta = [a.author, a.modified?.toLocaleString?.([], { dateStyle: "medium", timeStyle: "short" })]
      .filter(Boolean)
      .join(" · ");

    this.node.replaceChildren(
      el("div.rm-editor-head", {}, [
        swatches(nearestColorName(a.color), (name) => {
          this.store.update(id, { color: COLORS[name] });
          this.node.querySelectorAll(".rm-swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === name));
        }),
        el("button.rm-icon-button.rm-danger", {
          type: "button",
          title: a.type === "note" ? "Delete note" : "Remove highlight",
          html: icons.trash,
          onclick: () => {
            const target = this.id;
            this.hide();
            this.onDelete(target);
          },
        }),
        el("button.rm-icon-button", { type: "button", title: "Close", html: icons.close, onclick: () => this.close() }),
      ]),
      textarea,
      meta ? el("div.rm-editor-meta", {}, meta) : null,
    );
    place(this.node, anchor);
    if (focus) textarea.focus();
  }

  /** Write the textarea value to the store if it changed. */
  commit() {
    clearTimeout(this.timer);
    if (this.node.hidden || !this.id || !this.textarea) return;
    const a = this.store.get(this.id);
    if (a && (a.comment ?? "") !== this.textarea.value) this.store.update(this.id, { comment: this.textarea.value });
  }

  close() {
    if (this.node.hidden) return;
    this.commit();
    const { id, isNew } = this;
    this.hide();
    // A new sticky note that was never written in is discarded.
    const a = this.store.get(id);
    if (isNew && a?.type === "note" && !a.comment) this.onDelete(id);
    this.onClose?.(id);
  }

  hide() {
    this.node.hidden = true;
    this.textarea = null;
  }

  contains(node) {
    return this.node.contains(node);
  }
}
