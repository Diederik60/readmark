// Viewer registry. Each viewer handles a set of file extensions and renders a
// document into a container element.
//
// A viewer is an object:
//   {
//     id: string,
//     label: string,                       // used in the open dialog filter
//     extensions: string[],                // lower case, without dot
//     render(container, path, ctx): Promise<void>,
//     dispose?(): void,                    // called before switching documents
//   }
//
// `ctx` provides: backend, openPath(path), baseDir.
//
// To add PDF support later, create viewers/pdf/index.js exporting a viewer
// with extensions ["pdf"] and add it to the list below.

import { markdownViewer } from "./markdown/index.js";

export const viewers = [markdownViewer];

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
