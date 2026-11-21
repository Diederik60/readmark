// Link handling: never navigate the app window. External links go to the
// default browser, in-page anchors scroll, and links to other Markdown files
// open them in Readmark.

import { backend } from "./backend.js";
import { extname, hasScheme, resolvePath } from "./paths.js";
import { viewerFor } from "./viewers/index.js";

const EXTERNAL_SCHEMES = /^(https?|mailto|tel):/i;

export function installLinkHandler(root, { getBaseDir, openPath, showStatus }) {
  const handle = (event) => {
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || !root.contains(anchor)) return;
    event.preventDefault();

    const href = anchor.getAttribute("href").trim();
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id) ?? document.getElementsByName(id)[0];
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (EXTERNAL_SCHEMES.test(href)) {
      backend.openExternal(href).catch((err) => showStatus(String(err), "error"));
      return;
    }
    if (!hasScheme(href) && getBaseDir()) {
      const file = resolvePath(getBaseDir(), href.split(/[?#]/)[0]);
      if (viewerFor(extname(file))) {
        openPath(file);
        return;
      }
    }
    showStatus(`Can't open link: ${href}`, "error");
  };

  document.addEventListener("click", handle);
  // Middle click would otherwise try to open a new webview window.
  document.addEventListener("auxclick", handle);
}
