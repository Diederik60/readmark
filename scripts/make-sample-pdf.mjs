// Generates sample.pdf: a few pages of text for testing PDF viewing,
// search and annotation.   Usage: node scripts/make-sample-pdf.mjs
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const doc = await PDFDocument.create();
doc.setTitle("Readmark Sample Document");
doc.setAuthor("Readmark");
doc.setSubject("A few pages of text for testing PDF viewing and annotation");
doc.setCreationDate(new Date("2026-01-01T12:00:00Z"));
doc.setModificationDate(new Date("2026-01-01T12:00:00Z"));

const serif = await doc.embedFont(StandardFonts.TimesRoman);
const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

const W = 595.28; // A4
const H = 841.89;
const MARGIN = 72;
const BODY = 11.5;
const LEADING = 16;

let page;
let y;
let pageNo = 0;

function newPage() {
  page = doc.addPage([W, H]);
  pageNo++;
  y = H - MARGIN;
  const label = String(pageNo);
  page.drawText(label, { x: W / 2 - serif.widthOfTextAtSize(label, 10) / 2, y: 40, size: 10, font: serif, color: rgb(0.4, 0.4, 0.4) });
}

function ensure(space) {
  if (y - space < MARGIN) newPage();
}

function wrap(text, font, size, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(text, { font = serif, size = BODY, indent = 0 } = {}) {
  for (const line of wrap(text, font, size, W - 2 * MARGIN - indent)) {
    ensure(LEADING);
    page.drawText(line, { x: MARGIN + indent, y, size, font });
    y -= LEADING;
  }
  y -= 8;
}

function heading(text, size = 16) {
  ensure(size + 40);
  y -= 10;
  page.drawText(text, { x: MARGIN, y, size, font: serifBold });
  y -= size + 10;
}

// Title page
newPage();
y = H - 250;
for (const [text, font, size] of [
  ["Reading Between the Lines", serifBold, 28],
  ["Attention, Annotation and Memory in Long-Form Reading", serifItalic, 16],
  ["A sample document for Readmark", serif, 13],
]) {
  page.drawText(text, { x: W / 2 - font.widthOfTextAtSize(text, size) / 2, y, size, font });
  y -= size + 24;
}
y -= 40;
paragraph(
  "This document exists to test the PDF features of Readmark: smooth scrolling, zooming, thumbnails, text search, highlights in four colors, comments attached to highlights, and sticky notes placed anywhere on a page. Try selecting a sentence and highlighting it, then save with Cmd+S or Ctrl+S and open the file in another PDF reader.",
  { indent: 20 },
);

// Body
newPage();
heading("1  Introduction");
const intro = [
  "Readers have marked up texts for as long as there have been texts to mark. Medieval scribes filled margins with glosses, students underline textbooks, and researchers keep notebooks full of quotations. Annotation turns reading from a passive act into a conversation with the author.",
  "Digital documents promised to make this conversation easier, yet many readers still print papers to annotate them by hand. Part of the reason is friction: tools that are slow, that lock notes into proprietary formats, or that make it hard to find comments again later.",
  "This chapter argues that good annotation tools share three properties. They are fast enough to stay out of the way. They store notes in open formats that other software understands. And they make it easy to review every note in one place, so that annotations become a resource rather than clutter.",
];
intro.forEach((p) => paragraph(p));

heading("2  Attention and Memory");
const attention = [
  "Studies of reading comprehension consistently find that active strategies such as summarising, questioning and highlighting improve recall, but only when they involve real decisions about what matters. Highlighting everything is the same as highlighting nothing.",
  "A useful habit is to use colors with a fixed meaning. For example, yellow for key claims, green for evidence, blue for definitions and pink for open questions. Over a long document such as a thesis, this makes the structure of an argument visible at a glance.",
  "Comments add the reader's own voice. A short note such as \"contradicts section 4\" or \"cite this in the discussion\" is often worth more than a highlight, because it records why a passage mattered at the moment of reading.",
];
attention.forEach((p) => paragraph(p));

heading("3  Methods");
const methods = [
  "To evaluate an annotation workflow, we asked a group of graduate students to read a forty page paper and mark it up as they normally would. Half of the group used a printed copy and half used a PDF reader with highlight and comment tools.",
  "After one week, participants were asked to find the five passages they had considered most important, and to explain why. We measured the time needed to locate each passage and the accuracy of the explanation compared to the notes taken during reading.",
  "Participants using digital annotations located passages faster on average, mainly because they could search the text and browse a list of all their comments. Accuracy was similar in both groups, which suggests that the act of annotating, not the medium, drives understanding.",
  "These results are illustrative only; the study described here is fictional and exists to provide realistic text for testing Readmark.",
];
methods.forEach((p) => paragraph(p));

heading("4  Discussion");
const discussion = [
  "Open formats matter. Annotations saved as standard PDF objects remain readable in Preview on macOS, in Adobe Acrobat, in Microsoft Edge and in most other readers. Notes that live only inside one application are lost when that application disappears.",
  "Backups matter too. Any tool that writes into a document should keep a copy of the original, so that a mistake never costs the reader their work. Readmark writes a backup next to the file before its first save.",
  "Finally, review matters. A comments panel that lists every highlight and note with its page number turns a marked up document into an index of the reader's thinking. Clicking an entry should jump straight to the passage.",
];
discussion.forEach((p) => paragraph(p));

heading("5  Conclusion");
paragraph(
  "Annotation is an old practice with new tools. When those tools are fast, open and easy to review, readers can spend less effort managing their notes and more effort thinking. The search term for testing is \"marginalia\": it appears only here, in the final paragraph, so searching for it should jump to the last page.",
);

writeFileSync("sample.pdf", await doc.save());
console.log(`sample.pdf: ${pageNo} pages`);
