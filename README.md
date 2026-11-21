# Readmark

A lightweight desktop Markdown viewer and PDF annotator for macOS (Apple Silicon) and Windows, built with [Tauri v2](https://tauri.app) and plain HTML, CSS and JavaScript.

Open `sample.md` to see every Markdown feature. Open `sample.pdf` to try the PDF tools.

## Markdown features

- GitHub flavored Markdown: tables, task lists, footnotes, strikethrough, autolinks
- LaTeX math with KaTeX: `$inline$` and `$$display$$`
- Syntax highlighting (highlight.js) with a copy button on every code block
- Mermaid diagrams, in light and dark variants
- All HTML is sanitized with DOMPurify
- External links open in your default browser. Links to other Markdown files open in Readmark, and `#anchor` links scroll within the page
- Relative images (`![](img/photo.png)`) load from disk
- Reloads automatically when the open file changes on disk, keeping your scroll position
- Light and dark mode follow the system setting. Print output is always light and has clean page breaks
- Ways to open a file: double click it in Finder or Explorer, drag and drop, the **Open** button, or <kbd>Cmd+O</kbd> (macOS) / <kbd>Ctrl+O</kbd> (Windows)
- Print: <kbd>Cmd+P</kbd> / <kbd>Ctrl+P</kbd>
- Native macOS menu bar: About, Open, Print, Close Window, Quit, Edit and Window menus
- Works fully offline: every library is bundled into the app, with no CDNs

## PDF features

- Open PDFs the same ways as Markdown: double click (file association), drag and drop, the **Open** button, or <kbd>Cmd/Ctrl+O</kbd>
- Rendering with [pdf.js](https://mozilla.github.io/pdf.js/), bundled locally, including character maps, standard fonts and decoders
- Smooth scrolling, a page number box, and next/previous page buttons
- Zoom: <kbd>Cmd/Ctrl +</kbd>, <kbd>Cmd/Ctrl −</kbd>, <kbd>Cmd/Ctrl 0</kbd> for fit to width, pinch or Ctrl+scroll, and the toolbar buttons. Fit to width keeps fitting when the window or panels resize
- A page thumbnail sidebar
- Text search: <kbd>Cmd/Ctrl+F</kbd>. <kbd>Enter</kbd> goes to the next match, <kbd>Shift+Enter</kbd> to the previous one, and <kbd>Esc</kbd> closes the bar
- **Highlights**
  - Select text and pick yellow, green, blue or pink from the bar that appears, or from the toolbar.
  - Click a highlight to change its color, add a comment, or remove it.
- **Comments**
  - Use **Comment** in the selection bar to highlight text and comment on it in one step.
  - Click a highlight to add or edit its comment.
  - Highlights that have a comment show a small marker.
- **Sticky notes**
  - Click the note tool, then click anywhere on a page.
  - Notes can be dragged to move them, edited and deleted. A new note left empty is discarded.
- **Comments panel**
  - Lists every highlight and note in reading order, with the page number, the highlighted text and the comment.
  - Click an entry to jump to it, double click to edit it.
  - Edit and delete buttons appear on hover.
  - With an annotation selected, <kbd>Delete</kbd> or <kbd>Backspace</kbd> removes it.
- **Saving into the PDF:** <kbd>Cmd/Ctrl+S</kbd>. Annotations are written as standard PDF Highlight and Text (sticky note) annotations with Popup annotations, so they appear in macOS Preview, Adobe Acrobat, Microsoft Edge and other readers.
- **Backup:** before the first save of a file, Readmark copies the original to `name.backup.pdf` next to it. An existing backup is never overwritten, so it always holds the oldest version.
- **Save As:** <kbd>Cmd/Ctrl+Shift+S</kbd> writes an annotated copy and continues editing that copy.
- **Existing annotations:** highlights and notes made in Preview, Acrobat, Edge and similar apps are loaded, shown in the panel, and can be edited or deleted.
- **Unsaved changes:**
  - Closing the window, quitting (Cmd+Q) or opening another file asks you to Save, Don't Save or Cancel.
  - The title bar shows `•` while there are unsaved changes.
- **Protected work:** while there are unsaved annotations, a change to the file on disk does **not** reload the view. If you then save, Readmark asks before overwriting the other app's version.
- **Dark mode:** the interface follows the system theme. PDF pages are always shown as they are, never inverted.

## Prerequisites

Both platforms need:

- [Node.js](https://nodejs.org) 20 or newer, with npm
- [Rust](https://rustup.rs), stable toolchain

### macOS

```sh
xcode-select --install          # Xcode command line tools
```

### Windows

1. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**.
2. WebView2 comes preinstalled on Windows 10 (1803+) and 11. If it's missing, install the [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. Install Rust with `rustup` and use the default MSVC toolchain (`stable-x86_64-pc-windows-msvc`).

See the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for details.

## Development

```sh
npm install
npm run tauri dev
```

This starts the Vite dev server on port 1420 and opens the app with hot reload for the frontend. Changes to the Rust code trigger a rebuild.

To open a file straight away in development mode:

```sh
npm run tauri dev -- -- -- /absolute/path/to/sample.md
```

## Building

```sh
npm install
npm run tauri build
```

### macOS output

| Artifact | Path |
| --- | --- |
| App | `src-tauri/target/release/bundle/macos/Readmark.app` |
| Disk image | `src-tauri/target/release/bundle/dmg/Readmark_<version>_aarch64.dmg` |

Copy `Readmark.app` to `/Applications`. Then right click any `.md` file, choose **Get Info → Open with: Readmark → Change All…** to make Readmark the default viewer.

Readmark registers itself for PDFs as an *alternate* app, so Preview stays the default. To use Readmark for a file, choose **Open With → Readmark**, or use **Get Info → Change All…** for every PDF.

The build isn't code signed or notarized. On a different Mac, Gatekeeper will block it the first time: right click the app and choose **Open**, or run `xattr -cr /Applications/Readmark.app`. To sign, set `bundle.macOS.signingIdentity` and see the [Tauri signing docs](https://tauri.app/distribute/sign/macos/).

### Windows output

Run the same commands on a Windows PC:

| Artifact | Path |
| --- | --- |
| Installer | `src-tauri\target\release\bundle\nsis\Readmark_<version>_x64-setup.exe` |

The installer registers `.md`, `.markdown` and `.pdf` with Readmark. Windows keeps your current default app if you already chose one, so you may need **Open with → Choose another app** to pick Readmark.

## Project structure

```
index.html                  App shell (toolbar, welcome screen, document area)
src/
  main.js                   Wiring: commands, shortcuts, drag and drop, OS events, close guard
  backend.js                The only module that calls Tauri APIs
  documents.js              DocumentController: open, reload on change, unsaved-change guard, title
  links.js                  Link click handling (browser / in-app / anchors)
  paths.js, platform.js     Small helpers (POSIX and Windows paths, Cmd vs Ctrl)
  viewers/
    index.js                Viewer registry and the viewer interface
    markdown/               Markdown viewer: renderer, sanitizing, Mermaid, enhancements
    pdf/
      index.js              Lazy entry (pdf.js and pdf-lib load only when a PDF is opened)
      viewer.js             The PDF viewer: layout, pdf.js setup, tools, save
      pdfjs.js              pdf.js configuration (worker, local assets)
      thumbnails.js, search.js
      annotations/
        model.js            Annotation model and store (dirty tracking)
        pdf-io.js           Read/write standard PDF annotations with pdf-lib
        geometry.js         Screen <-> PDF coordinates, text selection -> rects
        overlay.js          Draws highlights and notes over the pages
        popover.js          Selection bar and annotation editor
        panel.js            Comments panel
  styles/                   base, markdown, highlight, print, pdf
src-tauri/
  src/lib.rs                App setup, plugins, macOS RunEvent::Opened / Reopen
  src/documents.rs          Open queue, file read/write (atomic), backups, quit
  src/watcher.rs            File watching (notify) -> "file-changed" event
  src/menu.rs               macOS menu bar
  tauri.conf.json           Shared config: file associations, CSP, bundle settings
  tauri.macos.conf.json     macOS bundle targets (app, dmg)
  tauri.windows.conf.json   Windows bundle target (nsis)
  capabilities/default.json Permissions granted to the window
scripts/make-sample-pdf.mjs Regenerates sample.pdf
assets/icon.svg             Source for the app icons
sample.md, sample.pdf       Feature demos
```

### Adding another document type

Create `src/viewers/<type>/index.js` that exports `{ id, label, extensions, create() }` and register it in `src/viewers/index.js`. The comment at the top of that file describes the interface. The open dialog filters and drag and drop pick up the new type automatically. Then add the extension to `bundle.fileAssociations`.

### Regenerating icons

```sh
npx tauri icon assets/icon.svg
rm -rf src-tauri/icons/android src-tauri/icons/ios   # desktop only
```

## Design decisions

These are choices I made without asking. Change any of them freely.

- **Vite as the bundler.** The code is plain JavaScript with no framework. Vite resolves the npm libraries and bundles them, KaTeX fonts included, into `dist/`, so the app has no runtime network dependencies. Mermaid (about 3 MB) is loaded only when a document contains a diagram, and pdf.js and pdf-lib only when a PDF is opened. `vite.config.js` copies pdf.js's runtime assets into `public/pdfjs/`.
- **markdown-it** renders the Markdown, using `markdown-it-footnote`, `markdown-it-task-lists` and `@vscode/markdown-it-katex` (the KaTeX plugin VS Code uses). An npm `overrides` entry forces every package onto one patched KaTeX version.
- **Raw HTML in Markdown is allowed**, then sanitized with DOMPurify. `<script>`, `<style>`, `<iframe>`, forms and event handlers are removed. Mermaid runs in `strict` security mode, and its SVG output is also passed through DOMPurify.
- **One document per window.** Opening a file replaces the current one. On Windows, the single instance plugin forwards a second launch's file to the running window.
- **On macOS the app keeps running after its window closes**, as Mac apps usually do. Opening a file or clicking the Dock icon creates a new window. Quit with Cmd+Q.
- **The watcher watches the file's folder, not the file itself.** Many editors save by writing a temp file and renaming it over the original, which would break a watch on the file. Reloads are debounced and keep the scroll position. If the file briefly disappears during a save, the current view stays.
- **The OS can request a file before the page has loaded.** Rust queues those paths, and the frontend fetches them with `frontend_ready` once its listeners are registered, so no file is lost at launch.
- **Asset protocol scope is `**`.** Images next to any document can load. The scope is broad, but this is a local, read-only viewer. The CSP also allows remote `https:` images, which is common in READMEs; remove `https:` from `img-src` in `tauri.conf.json` if you want strictly offline rendering.
- **Mermaid diagrams are rendered twice**, in light and dark themes, and CSS shows the one that matches. Theme changes switch instantly, and printing always uses the light version.
- **The Windows installer is per-user** (`installMode: currentUser`), so it doesn't need administrator rights.
- **PDF annotations are drawn by Readmark, not by pdf.js.**
  - On load, pdf-lib moves Highlight, Text and their Popup annotations out of the PDF into Readmark's annotation model. The copy pdf.js renders has them removed, so they aren't drawn twice.
  - On save, those annotations are written back.
  - All other annotation types (links, underlines, ink, form fields and so on) are left untouched.
  - Edited annotations are rewritten in a normalized form. Rich text formatting in comments, and Acrobat reply threads, are flattened into the plain comment text.
- **Saving rewrites the whole PDF** using pdf-lib, not an incremental update. The file is written to a temporary file first and then renamed over the original.
  - A digital signature on the PDF becomes invalid when you save annotations.
  - Encrypted or password-protected PDFs can be viewed (except password-protected ones), but not annotated.
- **Highlight appearance:** each highlight gets an appearance stream (filled rectangles with multiply blending), so readers that don't generate their own still show it with the text readable.
- **The pdf.js legacy build** is used so the app keeps working on older macOS versions, where the system WebKit is older.
- **Printing PDFs isn't supported yet.** Cmd/Ctrl+P on a PDF shows a hint to print from Preview or another reader instead.
- **Annotation author** is your OS user name (`$USER` / `%USERNAME%`).
- **Save As** continues editing the new copy, as most document apps do.
- **Bundle identifier** is `com.readmark.viewer`. Change it before distributing.
- **Code signing** is not set up on either platform.

## Platform notes

- macOS: Finder sends files through `RunEvent::Opened`, both at launch and while the app is running. Command line arguments also work: `Readmark.app/Contents/MacOS/readmark file.md`.
- Windows: Explorer passes the file as a command line argument. `tauri-plugin-single-instance` is registered first, so a second launch hands its arguments to the running instance and exits. Relative paths are resolved against the second instance's working directory.
- I compiled the Windows code paths on macOS during development by temporarily enabling the single instance plugin there, but I haven't run them on Windows yet.
- Shortcuts on Windows are handled in the webview (Ctrl+O/S/Shift+S/P/F/+/−/0). On macOS they are native menu items (File, Edit → Find, View → Zoom).

## Testing PDF annotations

`sample.pdf` has three pages of text. Search for "marginalia" to jump to the last page. To regenerate it, run `node scripts/make-sample-pdf.mjs`.
