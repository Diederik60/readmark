// The Markdown viewer.

import { renderMarkdown } from "./renderer.js";
import { renderMermaidBlocks } from "./mermaid.js";
import { addCopyButtons, addHeadingIds, resolveImages } from "./enhance.js";
import "katex/dist/katex.min.css";
import "../../styles/markdown.css";
import "../../styles/highlight.css";

export const markdownViewer = {
  id: "markdown",
  label: "Markdown",
  extensions: ["md", "markdown", "mdown", "mkd", "mkdn"],

  async render(container, path, ctx) {
    const { content } = await ctx.backend.readTextFile(path);
    container.className = "document markdown-body";
    container.innerHTML = renderMarkdown(content);
    addHeadingIds(container);
    addCopyButtons(container);
    resolveImages(container, ctx.baseDir, ctx.backend.fileUrl);
    await renderMermaidBlocks(container);
  },
};
