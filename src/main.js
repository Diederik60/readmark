import "./styles/base.css";
import "./styles/print.css";

import { backend } from "./backend.js";
import { DocumentController } from "./documents.js";
import { installLinkHandler } from "./links.js";
import { dirname, extname } from "./paths.js";
import { isMac, primaryModifier, shortcutLabel } from "./platform.js";
import { dialogFilters, viewerFor } from "./viewers/index.js";

const $ = (id) => document.getElementById(id);

const statusEl = $("status");
let statusTimer = null;
function showStatus(message, kind = "info") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  statusEl.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("visible"), kind === "error" ? 6000 : 2500);
}

const controller = new DocumentController(
  {
    container: $("document"),
    welcome: $("welcome"),
    viewport: $("viewport"),
    fileName: $("file-name"),
  },
  showStatus,
);

function openPaths(paths) {
  // Single document window: open the last supported file in the list.
  const supported = (paths ?? []).filter((p) => viewerFor(extname(p)));
  if (supported.length) controller.open(supported[supported.length - 1]);
  else if (paths?.length) showStatus("Unsupported file type", "error");
}

async function pickAndOpen() {
  try {
    const path = await backend.pickFile(dialogFilters());
    if (typeof path === "string") await controller.open(path);
  } catch (err) {
    showStatus(String(err), "error");
  }
}

// Shortcut labels
const openLabel = shortcutLabel("o");
$("open-shortcut").textContent = openLabel;
document.querySelectorAll(".open-shortcut-text").forEach((el) => (el.textContent = openLabel));
document.documentElement.classList.toggle("platform-mac", isMac);

$("open-button").addEventListener("click", pickAndOpen);

// Keyboard shortcuts. On macOS the native menu owns Cmd+O / Cmd+P.
document.addEventListener("keydown", (event) => {
  if (isMac || !primaryModifier(event) || event.shiftKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "o") {
    event.preventDefault();
    pickAndOpen();
  } else if (key === "p") {
    event.preventDefault();
    window.print();
  }
});

// Drag and drop (Tauri delivers real file paths).
const overlay = $("drop-overlay");
backend.onDragDrop((payload) => {
  if (payload.type === "enter" || payload.type === "over") {
    overlay.hidden = false;
  } else if (payload.type === "drop") {
    overlay.hidden = true;
    openPaths(payload.paths);
  } else {
    overlay.hidden = true;
  }
});

installLinkHandler(document.body, {
  getBaseDir: () => (controller.path ? dirname(controller.path) : null),
  openPath: (p) => controller.open(p),
  showStatus,
});

// Prevent the webview from navigating to dropped files or links by accident.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

async function init() {
  await Promise.all([
    backend.onOpenFiles(openPaths),
    backend.onFileChanged(() => controller.fileChanged()),
    backend.onMenu("open", pickAndOpen),
    backend.onMenu("print", () => window.print()),
  ]);
  // Only after listeners exist: fetch files requested at launch.
  openPaths(await backend.frontendReady());
}

init().catch((err) => showStatus(String(err), "error"));
