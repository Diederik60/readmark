// DOM post-processing of rendered (already sanitized) Markdown.

import { hasScheme, resolvePath } from "../../paths.js";

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5 2.5A1.5 1.5 0 0 1 6.5 1h6A1.5 1.5 0 0 1 14 2.5v8a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 10.5v-8Zm1.5-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-6ZM2 5.5A1.5 1.5 0 0 1 3.5 4H4v1h-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V13h1v.5A1.5 1.5 0 0 1 9.5 15h-6A1.5 1.5 0 0 1 2 13.5v-8Z"/></svg>';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function addCopyButtons(container) {
  for (const pre of container.querySelectorAll("pre.code-block")) {
    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";
    pre.replaceWith(wrapper);
    wrapper.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.title = "Copy code";
    button.innerHTML = `${COPY_ICON}<span>Copy</span>`;
    button.addEventListener("click", async () => {
      await copyText(pre.querySelector("code")?.textContent ?? pre.textContent);
      button.classList.add("copied");
      button.querySelector("span").textContent = "Copied";
      setTimeout(() => {
        button.classList.remove("copied");
        button.querySelector("span").textContent = "Copy";
      }, 1500);
    });
    wrapper.append(button);
  }
}

/** GitHub-style heading ids so `[link](#some-heading)` works. */
export function addHeadingIds(container) {
  const seen = new Map();
  for (const h of container.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (h.id) continue;
    const base =
      h.textContent
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s/g, "-") || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    h.id = n === 0 ? base : `${base}-${n}`;
  }
}

/** Point relative image paths at local files via the asset protocol. */
export function resolveImages(container, baseDir, fileUrl) {
  for (const img of container.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src || hasScheme(src) || src.startsWith("//")) continue;
    img.src = fileUrl(resolvePath(baseDir, src.split(/[?#]/)[0]));
  }
  for (const img of container.querySelectorAll("img")) img.loading = "lazy";
}
