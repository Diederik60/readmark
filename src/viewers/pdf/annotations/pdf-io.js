// Reading and writing annotations as standard PDF annotations with pdf-lib.
//
// Readmark "manages" Highlight and Text (sticky note) annotations plus their
// Popup children: on load they are moved out of the PDF into the editable
// model (and stripped from the copy pdf.js renders, so they aren't drawn
// twice); on save they are written back. All other annotation types (links,
// underlines, ink, form fields, ...) are left untouched.

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from "pdf-lib";
import { COLORS, newId } from "./model.js";

const MANAGED = new Set(["Highlight", "Text"]);
const N = (name) => PDFName.of(name);

// Annotation flags
const FLAG_PRINT = 4;
const FLAG_NO_ZOOM = 8;
const FLAG_NO_ROTATE = 16;

// ---------------------------------------------------------------------------
// Helpers

function nameOf(obj) {
  return obj instanceof PDFName ? obj.asString().replace(/^\//, "") : undefined;
}

function textOf(obj) {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    try {
      return obj.decodeText();
    } catch {
      return "";
    }
  }
  return "";
}

function numbersOf(obj) {
  if (!(obj instanceof PDFArray)) return null;
  return obj.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
}

function colorOf(obj) {
  const c = numbersOf(obj);
  if (!c || c.length === 0) return null;
  if (c.length === 1) return [c[0], c[0], c[0]];
  if (c.length === 4) {
    const [C, M, Y, K] = c;
    return [(1 - C) * (1 - K), (1 - M) * (1 - K), (1 - Y) * (1 - K)];
  }
  return c.slice(0, 3);
}

/** Parse "D:YYYYMMDDHHmmSSOHH'mm'" (all parts after the year optional). */
export function parsePdfDate(str) {
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(str ?? "");
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", tz, th = "00", tm = "00"] = m;
  let iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  if (tz === "+" || tz === "-") iso += `${tz}${th}:${tm}`;
  else if (tz) iso += "Z";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPdfDate(date = new Date()) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}'${pad(offset % 60)}'`
  );
}

const round = (n) => Math.round(n * 1000) / 1000;

function quadsToRects(q) {
  const rects = [];
  for (let i = 0; i + 7 < q.length; i += 8) {
    const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]];
    const ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
    rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return rects;
}

function normRect(r) {
  return [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
}

function refKey(ref) {
  return ref instanceof PDFRef ? ref.toString() : null;
}

/** Iterate the annotations of every page. */
function* annotationsOf(doc) {
  const pages = doc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const dict = raw instanceof PDFRef ? doc.context.lookup(raw) : raw;
      yield { page, pageIndex, raw, dict: dict instanceof PDFDict ? dict : null };
    }
  }
}

function isManaged(doc, dict) {
  if (!dict) return false;
  const subtype = nameOf(dict.get(N("Subtype")));
  if (MANAGED.has(subtype)) return true;
  if (subtype === "Popup") {
    const parent = dict.get(N("Parent"));
    const parentDict = parent ? doc.context.lookup(parent) : null;
    return parentDict instanceof PDFDict && MANAGED.has(nameOf(parentDict.get(N("Subtype"))));
  }
  return false;
}

/** Remove managed annotations from all pages. Returns true if any were removed. */
function stripManaged(doc, { deleteObjects }) {
  let removed = false;
  const toDelete = new Set();
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const keep = [];
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const dict = raw instanceof PDFRef ? doc.context.lookup(raw) : raw;
      if (dict instanceof PDFDict && isManaged(doc, dict)) {
        removed = true;
        if (raw instanceof PDFRef) toDelete.add(raw);
        const ap = dict.lookupMaybe?.(N("AP"), PDFDict);
        const normal = ap?.get(N("N"));
        if (normal instanceof PDFRef) toDelete.add(normal);
      } else {
        keep.push(raw);
      }
    }
    if (keep.length !== annots.size()) {
      if (keep.length) page.node.set(N("Annots"), doc.context.obj(keep));
      else page.node.delete(N("Annots"));
    }
  }
  if (deleteObjects) for (const ref of toDelete) doc.context.delete(ref);
  return removed;
}

// ---------------------------------------------------------------------------
// Load

/**
 * Parse a PDF, extract the managed annotations into model objects and
 * produce the bytes pdf.js should display (managed annotations removed).
 *
 * @returns {Promise<{annotations: object[], displayBytes: Uint8Array, editable: boolean, reason?: string}>}
 */
export async function loadAnnotatedPdf(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err) {
    return { annotations: [], displayBytes: bytes, editable: false, reason: `This PDF can't be annotated (${err.message}).` };
  }
  if (doc.isEncrypted) {
    return { annotations: [], displayBytes: bytes, editable: false, reason: "Encrypted PDFs can't be annotated." };
  }

  const annotations = [];
  const byRef = new Map();
  const replies = [];

  for (const { pageIndex, raw, dict } of annotationsOf(doc)) {
    if (!dict) continue;
    const subtype = nameOf(dict.get(N("Subtype")));
    if (!MANAGED.has(subtype)) continue;

    const rect = numbersOf(dict.get(N("Rect")));
    if (!rect || rect.length < 4) continue;
    let comment = textOf(dict.get(N("Contents")));
    if (!comment) {
      const rc = textOf(dict.get(N("RC")));
      if (rc) comment = rc.replace(/<[^>]+>/g, "").trim();
    }
    const author = textOf(dict.get(N("T")));
    const modified = parsePdfDate(textOf(dict.get(N("M")))) ?? new Date();
    const created = parsePdfDate(textOf(dict.get(N("CreationDate")))) ?? modified;

    // Replies (Acrobat) become part of the parent's comment.
    const irt = dict.get(N("IRT"));
    if (irt) {
      if (!dict.get(N("State"))) replies.push({ parent: refKey(irt), author, comment, created });
      continue;
    }

    const base = {
      id: textOf(dict.get(N("NM"))) || newId(),
      pageIndex,
      comment,
      author,
      created,
      modified,
    };
    let annotation;
    if (subtype === "Highlight") {
      const quads = numbersOf(dict.get(N("QuadPoints")));
      const rects = quads?.length >= 8 ? quadsToRects(quads) : [normRect(rect)];
      annotation = { ...base, type: "highlight", rects, color: colorOf(dict.get(N("C"))) ?? COLORS.yellow };
    } else {
      const r = normRect(rect);
      annotation = { ...base, type: "note", point: [r[0], r[3]], color: colorOf(dict.get(N("C"))) ?? COLORS.yellow };
    }
    // Duplicate /NM values exist in the wild; keep ids unique.
    if (annotations.some((a) => a.id === annotation.id)) annotation.id = newId();
    annotations.push(annotation);
    const key = refKey(raw);
    if (key) byRef.set(key, annotation);
  }

  replies.sort((a, b) => a.created - b.created);
  for (const reply of replies) {
    const parent = byRef.get(reply.parent);
    if (!parent || !reply.comment) continue;
    const who = reply.author ? `${reply.author}: ` : "";
    parent.comment = parent.comment ? `${parent.comment}\n\n${who}${reply.comment}` : `${who}${reply.comment}`;
  }

  const removed = stripManaged(doc, { deleteObjects: true });
  const displayBytes = removed ? await doc.save({ useObjectStreams: false }) : bytes;
  return { annotations, displayBytes, editable: true };
}

// ---------------------------------------------------------------------------
// Save

function pdfText(str) {
  return PDFHexString.fromText(str ?? "");
}

function boundingBox(rects) {
  return [
    Math.min(...rects.map((r) => r[0])),
    Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])),
    Math.max(...rects.map((r) => r[3])),
  ];
}

function commonFields(a, page) {
  return {
    Type: "Annot",
    P: page.ref,
    NM: pdfText(a.id),
    T: pdfText(a.author ?? ""),
    Contents: pdfText(a.comment ?? ""),
    M: PDFString.of(formatPdfDate(a.modified ?? new Date())),
    CreationDate: PDFString.of(formatPdfDate(a.created ?? new Date())),
    C: a.color.map(round),
  };
}

function addPopup(doc, page, parentRef, parentDict, rect) {
  const { width, height } = page.getSize();
  const x = Math.min(rect[2] + 10, width - 200);
  const top = Math.min(rect[3], height);
  const popup = doc.context.obj({
    Type: "Annot",
    Subtype: "Popup",
    Parent: parentRef,
    Rect: [x, top - 120, x + 200, top].map(round),
    Open: false,
    F: FLAG_PRINT | FLAG_NO_ZOOM | FLAG_NO_ROTATE,
  });
  const popupRef = doc.context.register(popup);
  parentDict.set(N("Popup"), popupRef);
  page.node.addAnnot(popupRef);
}

function addHighlight(doc, page, a) {
  const rects = a.rects.map(normRect);
  const bbox = boundingBox(rects).map(round);
  // De facto QuadPoints order (Acrobat, Preview, pdf.js): top-left,
  // top-right, bottom-left, bottom-right.
  const quadPoints = rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]).map(round);

  // Appearance stream: filled rects with multiply blending, so text stays
  // readable. Viewers that regenerate appearances ignore it.
  const [r, g, b] = a.color.map(round);
  const ops = rects.map(([x1, y1, x2, y2]) => `${round(x1)} ${round(y1)} ${round(x2 - x1)} ${round(y2 - y1)} re`);
  const content = `/GS0 gs ${r} ${g} ${b} rg ${ops.join(" ")} f`;
  const appearance = doc.context.stream(content, {
    Type: "XObject",
    Subtype: "Form",
    FormType: 1,
    BBox: bbox,
    Resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", CA: 1, ca: 1 } } },
  });
  const apRef = doc.context.register(appearance);

  const dict = doc.context.obj({
    ...commonFields(a, page),
    Subtype: "Highlight",
    Rect: bbox,
    QuadPoints: quadPoints,
    F: FLAG_PRINT,
    AP: { N: apRef },
  });
  const ref = doc.context.register(dict);
  page.node.addAnnot(ref);
  if (a.comment) addPopup(doc, page, ref, dict, bbox);
}

function addNote(doc, page, a) {
  const [x, top] = a.point;
  const rect = [x, top - 20, x + 20, top].map(round);
  const dict = doc.context.obj({
    ...commonFields(a, page),
    Subtype: "Text",
    Rect: rect,
    Name: "Comment",
    Open: false,
    F: FLAG_PRINT | FLAG_NO_ZOOM | FLAG_NO_ROTATE,
  });
  const ref = doc.context.register(dict);
  page.node.addAnnot(ref);
  addPopup(doc, page, ref, dict, rect);
}

/**
 * Write the annotations into a copy of `originalBytes`: existing managed
 * annotations are replaced by the ones in `annotations`.
 * @returns {Promise<Uint8Array>}
 */
export async function saveAnnotatedPdf(originalBytes, annotations) {
  const doc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  stripManaged(doc, { deleteObjects: true });
  const pages = doc.getPages();
  for (const a of annotations) {
    const page = pages[a.pageIndex];
    if (!page) continue;
    if (a.type === "highlight" && a.rects?.length) addHighlight(doc, page, a);
    else if (a.type === "note" && a.point) addNote(doc, page, a);
  }
  return doc.save({ useObjectStreams: false });
}
