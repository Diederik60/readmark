// The Markdown viewer.

import { renderMarkdown } from "./renderer.js";
import { renderMermaidBlocks } from "./mermaid.js";
import { addCopyButtons, addHeadingIds, resolveImages } from "./enhance.js";
import "katex/dist/katex.min.css";
import "../../styles/markdown.css";
import "../../styles/highlight.css";

class MarkdownViewer {
  async mount(container, path, ctx) {
    this.container = container;
    this.path = path;
    this.ctx = ctx;
    await this.render();
    ctx.viewport.scrollTop = 0;
  }

  async reload() {
    const { viewport } = this.ctx;
    const scroll = viewport.scrollTop;
    await this.render();
    viewport.scrollTop = scroll;
  }

  /** Render into a detached element first, so a failed read keeps the old view. */
  async render() {
    const { content } = await this.ctx.backend.readTextFile(this.path);
    const staging = document.createElement("div");
    staging.innerHTML = renderMarkdown(content);
    addHeadingIds(staging);
    addCopyButtons(staging);
    resolveImages(staging, this.ctx.baseDir, this.ctx.backend.fileUrl);
    await renderMermaidBlocks(staging);
    this.container.classList.add("markdown-body");
    this.container.replaceChildren(...staging.childNodes);
  }

  command(name) {
    if (name === "print") {
      window.print();
      return true;
    }
    return false;
  }

  unmount() {}
}

export const markdownViewer = {
  id: "markdown",
  label: "Markdown",
  extensions: ["md", "markdown", "mdown", "mkd", "mkdn"],
  create: () => new MarkdownViewer(),
};
