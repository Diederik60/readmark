// Mermaid rendering. Mermaid is large, so it is only loaded when a document
// actually contains a diagram. Every diagram is rendered in a light and a
// dark variant; CSS shows the one matching the system theme, and printing
// always uses the light one.

import { sanitizeSvg } from "./renderer.js";

let mermaidPromise = null;
let counter = 0;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

async function renderVariant(mermaid, theme, source) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
    fontFamily: "inherit",
  });
  const id = `mermaid-${++counter}`;
  const { svg } = await mermaid.render(id, source);
  return sanitizeSvg(svg);
}

export async function renderMermaidBlocks(container) {
  const blocks = [...container.querySelectorAll(".mermaid-block")];
  if (blocks.length === 0) return;
  const mermaid = await loadMermaid();

  // Render sequentially: mermaid.initialize is global state.
  for (const block of blocks) {
    const source = block.querySelector(".mermaid-source")?.textContent ?? "";
    try {
      const light = await renderVariant(mermaid, "default", source);
      const dark = await renderVariant(mermaid, "dark", source);
      block.innerHTML = `<div class="mermaid-light">${light}</div><div class="mermaid-dark">${dark}</div>`;
    } catch (err) {
      block.classList.add("mermaid-error");
      const msg = document.createElement("div");
      msg.className = "render-error";
      msg.textContent = `Mermaid error: ${err?.message ?? err}`;
      block.prepend(msg);
    }
  }
  // Mermaid may leave temporary elements behind on errors.
  document.querySelectorAll("body > [id^='dmermaid-']").forEach((el) => el.remove());
}
