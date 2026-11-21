// pdf.js setup. The legacy build is used for compatibility with the system
// WebKit on older macOS versions. Everything is bundled locally: the worker
// via Vite, and cmaps / fonts / wasm via public/pdfjs (see vite.config.js).

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/legacy/web/pdf_viewer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
// The viewer components read the core library from this global.
globalThis.pdfjsLib = pdfjsLib;

let viewerModule = null;

export async function loadPdfjs() {
  viewerModule ??= import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
  return { pdfjsLib, ...(await viewerModule) };
}

const abs = (p) => new URL(p, window.location.href).href;

export function documentParams() {
  return {
    cMapUrl: abs("/pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: abs("/pdfjs/standard_fonts/"),
    wasmUrl: abs("/pdfjs/wasm/"),
    iccUrl: abs("/pdfjs/iccs/"),
  };
}
