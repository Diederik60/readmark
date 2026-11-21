// Markdown -> sanitized HTML.

import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const md = new MarkdownIt({
  html: true, // raw HTML is allowed in Markdown; DOMPurify sanitizes the result
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    const language = (lang || "").toLowerCase();
    let body;
    if (language && hljs.getLanguage(language)) {
      body = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } else {
      body = escapeHtml(code);
    }
    const label = language ? ` data-lang="${escapeHtml(language)}"` : "";
    return `<pre class="code-block"${label}><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${body}</code></pre>`;
  },
})
  .use(footnote)
  .use(taskLists, { enabled: false, label: true })
  .use(katexPlugin.default ?? katexPlugin, { throwOnError: false, output: "htmlAndMathml" });

// Mermaid fences become placeholders that are rendered after sanitizing.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0].toLowerCase();
  if (lang === "mermaid") {
    return `<div class="mermaid-block"><pre class="mermaid-source">${escapeHtml(token.content)}</pre></div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_ATTR: ["target"],
  FORBID_TAGS: ["style", "form", "iframe", "object", "embed"],
};

export function renderMarkdown(source) {
  const html = md.render(source);
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/** Sanitize SVG produced by Mermaid (which uses <style> and foreignObject). */
export function sanitizeSvg(svg) {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ["foreignObject", "style"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
}
