// Find bar backed by pdf.js' PDFFindController.

import { el, icons } from "./dom.js";

const FOUND = 0;
const NOT_FOUND = 1;
const PENDING = 3;

export class SearchBar {
  constructor(node, eventBus) {
    this.node = node;
    this.eventBus = eventBus;
    this.input = el("input.rm-search-input", {
      type: "search",
      placeholder: "Find in document",
      spellcheck: false,
      oninput: () => this.#find(""),
      onkeydown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.#find("again", e.shiftKey);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
      },
    });
    this.count = el("span.rm-search-count");
    node.append(
      this.input,
      this.count,
      el("button.rm-icon-button", { type: "button", title: "Previous (Shift+Enter)", html: icons.up, onclick: () => this.#find("again", true) }),
      el("button.rm-icon-button", { type: "button", title: "Next (Enter)", html: icons.down, onclick: () => this.#find("again", false) }),
      el("button.rm-icon-button", { type: "button", title: "Close (Esc)", html: icons.close, onclick: () => this.close() }),
    );

    eventBus.on("updatefindmatchescount", ({ matchesCount }) => this.#showCount(matchesCount));
    eventBus.on("updatefindcontrolstate", ({ state, matchesCount }) => {
      if (state === NOT_FOUND) this.count.textContent = this.input.value ? "No results" : "";
      else if (state === PENDING) this.count.textContent = "…";
      else if (state === FOUND || matchesCount) this.#showCount(matchesCount);
      this.node.classList.toggle("not-found", state === NOT_FOUND && !!this.input.value);
    });
  }

  get isOpen() {
    return !this.node.hidden;
  }

  open() {
    this.node.hidden = false;
    this.input.focus();
    this.input.select();
    if (this.input.value) this.#find("highlightallchange");
  }

  close() {
    this.node.hidden = true;
    this.eventBus.dispatch("findbarclose", { source: this });
  }

  #showCount(matchesCount) {
    if (!matchesCount || !this.input.value) return;
    const { current, total } = matchesCount;
    this.count.textContent = total ? `${current} of ${total}` : "No results";
  }

  #find(type, findPrevious = false) {
    this.eventBus.dispatch("find", {
      source: this,
      type,
      query: this.input.value,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  }
}
