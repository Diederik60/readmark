// Converting between screen coordinates and PDF user space.

/**
 * Page geometry helper for a pdf.js page view.
 * The page div has a border; the content box is what the viewport maps to.
 */
export function pageGeometry(pageView) {
  const div = pageView.div;
  const box = div.getBoundingClientRect();
  const left = box.left + div.clientLeft;
  const top = box.top + div.clientTop;
  // Bounding box includes CSS transforms applied during zoom; client sizes don't.
  const scaleX = (box.width - 2 * div.clientLeft) / div.clientWidth || 1;
  const width = div.clientWidth * scaleX;
  const height = div.clientHeight * scaleX;
  const viewport = pageView.viewport;
  const toViewport = (clientX, clientY) => [
    ((clientX - left) / width) * viewport.width,
    ((clientY - top) / height) * viewport.height,
  ];
  return {
    viewport,
    /** Client (screen) point -> PDF point. */
    toPdf(clientX, clientY) {
      return viewport.convertToPdfPoint(...toViewport(clientX, clientY));
    },
    /** Client rect -> normalized PDF rect [x1, y1, x2, y2]. */
    rectToPdf(r) {
      const [ax, ay] = this.toPdf(r.left, r.top);
      const [bx, by] = this.toPdf(r.right, r.bottom);
      return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
    },
  };
}

/** PDF rect -> percentages of the page box: { left, top, width, height }. */
export function pdfRectToPercent(viewport, rect) {
  // (pdf.js v6 removed convertToViewportRectangle; convert both corners.)
  const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]);
  const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    left: (left / viewport.width) * 100,
    top: (top / viewport.height) * 100,
    width: (Math.abs(x2 - x1) / viewport.width) * 100,
    height: (Math.abs(y2 - y1) / viewport.height) * 100,
  };
}

export function pdfPointToPercent(viewport, [x, y]) {
  const [vx, vy] = viewport.convertToViewportPoint(x, y);
  return { left: (vx / viewport.width) * 100, top: (vy / viewport.height) * 100 };
}

/** Collect the text nodes of the pdf.js text layers covered by a selection. */
function selectedTextPieces(selection) {
  const pieces = [];
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    const container = range.commonAncestorContainer;
    let nodes = [];
    if (container.nodeType === Node.TEXT_NODE) {
      nodes = [container];
    } else {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
      }
    }
    for (const node of nodes) {
      const layer = node.parentElement?.closest(".textLayer");
      const pageDiv = layer?.closest(".page");
      if (!pageDiv) continue;
      const r = document.createRange();
      r.selectNodeContents(node);
      if (node === range.startContainer) r.setStart(node, range.startOffset);
      if (node === range.endContainer) r.setEnd(node, range.endOffset);
      const text = r.toString();
      if (!text.trim()) continue;
      pieces.push({ pageNumber: Number(pageDiv.dataset.pageNumber), rects: [...r.getClientRects()], text });
    }
  }
  return pieces;
}

/** Merge rects that sit on the same line and touch or nearly touch. */
export function mergeLineRects(rects) {
  const sorted = rects
    .filter((r) => r[2] - r[0] > 0.3 && r[3] - r[1] > 0.3)
    .sort((a, b) => b[3] - a[3] || a[0] - b[0]);
  const lines = [];
  for (const r of sorted) {
    const h = r[3] - r[1];
    const line = lines.find((l) => {
      const overlap = Math.min(l[3], r[3]) - Math.max(l[1], r[1]);
      const minH = Math.min(h, l[3] - l[1]);
      const gap = Math.max(r[0] - l[2], l[0] - r[2]);
      return overlap > minH * 0.5 && gap < minH * 0.8;
    });
    if (line) {
      line[0] = Math.min(line[0], r[0]);
      line[1] = Math.min(line[1], r[1]);
      line[2] = Math.max(line[2], r[2]);
      line[3] = Math.max(line[3], r[3]);
    } else {
      lines.push([...r]);
    }
  }
  return lines.sort((a, b) => b[3] - a[3] || a[0] - b[0]);
}

/**
 * Convert the current text selection into per-page PDF rects.
 * @returns {{ pageIndex: number, rects: number[][], text: string }[]}
 */
export function selectionToPdfRects(selection, getPageView) {
  const byPage = new Map();
  for (const piece of selectedTextPieces(selection)) {
    const pageView = getPageView(piece.pageNumber - 1);
    if (!pageView) continue;
    const geom = pageGeometry(pageView);
    const entry = byPage.get(piece.pageNumber) ?? { pageIndex: piece.pageNumber - 1, rects: [], text: [] };
    for (const r of piece.rects) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      entry.rects.push(geom.rectToPdf(r));
    }
    entry.text.push(piece.text);
    byPage.set(piece.pageNumber, entry);
  }
  return [...byPage.values()]
    .map((e) => ({ pageIndex: e.pageIndex, rects: mergeLineRects(e.rects), text: joinText(e.text) }))
    .filter((e) => e.rects.length);
}

function joinText(parts) {
  return parts.join(" ").replace(/\s+/g, " ").replace(/- (\p{Ll})/gu, "$1").trim();
}

/** Extract the text covered by `rects` from pdf.js textContent (for imported highlights). */
export function textInRects(textContent, rects) {
  const out = [];
  for (const item of textContent.items) {
    if (!item.str) continue;
    const [, , , , x, y] = item.transform;
    const w = item.width;
    const h = item.height || Math.hypot(item.transform[2], item.transform[3]);
    const cy = y + h / 2;
    for (const [x1, y1, x2, y2] of rects) {
      if (cy < y1 || cy > y2) continue;
      const from = Math.max(x1, x);
      const to = Math.min(x2, x + w);
      if (to - from < Math.min(2, w / 2)) continue;
      const n = item.str.length;
      const start = Math.max(0, Math.round(((from - x) / w) * n));
      const end = Math.min(n, Math.round(((to - x) / w) * n));
      out.push({ y, x: from, str: item.str.slice(start, end) });
      break;
    }
  }
  out.sort((a, b) => b.y - a.y || a.x - b.x);
  return joinText(out.map((o) => o.str));
}
