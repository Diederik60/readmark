// Side panel listing all highlights and notes in reading order.

import { el, icons } from "../dom.js";
import { cssColor } from "./model.js";

export class CommentsPanel {
  /**
   * @param {HTMLElement} node
   * @param {object} opts { store, onJump(id), onEdit(id), onDelete(id), getText(a): Promise<string> }
   */
  constructor(node, { store, onJump, onEdit, onDelete, getText }) {
    this.node = node;
    this.store = store;
    this.onJump = onJump;
    this.onEdit = onEdit;
    this.onDelete = onDelete;
    this.getText = getText;
    this.selectedId = null;
    this.header = el("div.rm-panel-header");
    this.list = el("div.rm-panel-list");
    node.append(this.header, this.list);
    store.addEventListener("change", () => this.render());
    this.render();
  }

  setSelected(id) {
    this.selectedId = id;
    this.list.querySelectorAll(".rm-item").forEach((n) => n.classList.toggle("selected", n.dataset.id === id));
    this.list.querySelector(".rm-item.selected")?.scrollIntoView({ block: "nearest" });
  }

  render() {
    const items = this.store.all();
    const highlights = items.filter((a) => a.type === "highlight").length;
    const notes = items.length - highlights;
    this.header.textContent = items.length
      ? `${highlights} highlight${highlights === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}`
      : "Annotations";

    if (!items.length) {
      this.list.replaceChildren(
        el("div.rm-panel-empty", {}, [
          el("p", {}, "No highlights or notes yet."),
          el("p", {}, "Select text to highlight it, or use the note tool to place a sticky note."),
        ]),
      );
      return;
    }

    this.list.replaceChildren(
      ...items.map((a) => {
        const quote = el("div.rm-item-quote");
        if (a.type === "highlight") {
          if (a.text != null) quote.textContent = a.text;
          else
            this.getText(a).then((t) => {
              quote.textContent = t;
            });
        }
        return el(
          `div.rm-item${a.id === this.selectedId ? ".selected" : ""}`,
          {
            dataset: { id: a.id },
            tabIndex: 0,
            style: `--item-color:${cssColor(a.color)}`,
            onclick: () => this.onJump(a.id),
            ondblclick: () => this.onEdit(a.id),
            onkeydown: (e) => {
              if (e.key === "Enter") this.onEdit(a.id);
            },
          },
          [
            el("div.rm-item-head", {}, [
              el("span.rm-item-kind", {
                html: a.type === "note" ? icons.note : "",
              }),
              el("span.rm-item-page", {}, `Page ${a.pageIndex + 1}${a.type === "note" ? " · Note" : ""}`),
              el("span.rm-item-actions", {}, [
                el("button.rm-icon-button", {
                  type: "button",
                  title: "Edit",
                  html: icons.comments,
                  onclick: (e) => {
                    e.stopPropagation();
                    this.onEdit(a.id);
                  },
                }),
                el("button.rm-icon-button.rm-danger", {
                  type: "button",
                  title: "Delete",
                  html: icons.trash,
                  onclick: (e) => {
                    e.stopPropagation();
                    this.onDelete(a.id);
                  },
                }),
              ]),
            ]),
            a.type === "highlight" ? quote : null,
            a.comment
              ? el("div.rm-item-comment", {}, a.comment)
              : a.type === "highlight"
                ? null
                : el("div.rm-item-comment.empty", {}, "Empty note"),
          ],
        );
      }),
    );
  }
}
