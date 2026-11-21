// Viewer registry. Each entry handles a set of file extensions and creates a
// viewer instance for one open document.
//
// Entry:     { id, label, extensions: string[], create(): Viewer }
// Viewer:    {
//   mount(container, path, ctx): Promise<void>  // render the document
//   reload(): Promise<void>                      // file changed on disk
//   unmount(): void
//   isDirty?(): boolean                          // unsaved changes
//   save?(): Promise<boolean>                    // true when saved
//   saveAs?(): Promise<boolean>
//   command?(name): boolean                      // find, zoom-in, zoom-out, zoom-fit, print
// }
//
// ctx (from DocumentController): backend, viewport, baseDir, openPath(path),
// showStatus(msg, kind), setDirty(bool), suppressReload(ms),
// pathChanged(newPath), confirmOverwrite(): Promise<boolean>

import { markdownViewer } from "./markdown/index.js";
import { pdfViewer } from "./pdf/index.js";

export const viewers = [markdownViewer, pdfViewer];

export function viewerFor(ext) {
  return viewers.find((v) => v.extensions.includes(ext)) ?? null;
}

export function dialogFilters() {
  const all = viewers.flatMap((v) => v.extensions);
  return [
    { name: "Supported documents", extensions: all },
    ...viewers.map((v) => ({ name: v.label, extensions: v.extensions })),
  ];
}
