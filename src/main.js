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

async function openPaths(paths) {
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

$("open-button").addEventListener("click", () => pickAndOpen());

// Commands, triggered by the macOS menu or by keyboard shortcuts elsewhere.
const commands = {
  open: pickAndOpen,
  save: async () => {
    if (controller.viewer && !controller.viewer.save) showStatus("Nothing to save");
    else await controller.save();
  },
  "save-as": async () => {
    if (controller.viewer && !controller.viewer.saveAs) showStatus("Save As is available for PDF files");
    else await controller.saveAs();
  },
  print: () => {
    if (!controller.command("print")) window.print();
  },
  find: () => controller.command("find"),
  "zoom-in": () => controller.command("zoom-in"),
  "zoom-out": () => controller.command("zoom-out"),
  "zoom-fit": () => controller.command("zoom-fit"),
  quit: async () => {
    if (await controller.confirmDiscard()) await backend.quit();
  },
};

// Keyboard shortcuts. On macOS the native menu owns these accelerators.
const SHORTCUTS = {
  o: "open",
  s: "save",
  S: "save-as",
  p: "print",
  f: "find",
  "=": "zoom-in",
  "+": "zoom-in",
  "-": "zoom-out",
  0: "zoom-fit",
};
document.addEventListener("keydown", (event) => {
  if (isMac || !primaryModifier(event) || event.altKey) return;
  let key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.shiftKey && key === "s") key = "S";
  const name = SHORTCUTS[key];
  if (!name) return;
  event.preventDefault();
  commands[name]();
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
    ...Object.entries(commands).map(([name, run]) => backend.onMenu(name, run)),
    // Unsaved changes: ask before the window closes.
    backend.onCloseRequested(async (event) => {
      if (!(await controller.confirmDiscard())) event.preventDefault();
    }),
  ]);
  // Only after listeners exist: fetch files requested at launch.
  openPaths(await backend.frontendReady());
}

init().catch((err) => showStatus(String(err), "error"));
