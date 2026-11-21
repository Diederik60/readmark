# Readmark

A lightweight desktop Markdown viewer for macOS (Apple Silicon) and Windows, built with [Tauri v2](https://tauri.app) and plain HTML, CSS and JavaScript.

Open `sample.md` in Readmark to see every supported feature.

## Features

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

The build isn't code signed or notarized. On a different Mac, Gatekeeper will block it the first time: right click the app and choose **Open**, or run `xattr -cr /Applications/Readmark.app`. To sign, set `bundle.macOS.signingIdentity` and see the [Tauri signing docs](https://tauri.app/distribute/sign/macos/).

### Windows output

Run the same commands on a Windows PC:

| Artifact | Path |
| --- | --- |
| Installer | `src-tauri\target\release\bundle\nsis\Readmark_<version>_x64-setup.exe` |

The installer registers `.md` and `.markdown` with Readmark. Windows may still ask you to confirm the default app the first time you open a Markdown file.

## Project structure

```
index.html                  App shell (toolbar, welcome screen, document area)
src/
  main.js                   Wiring: open button, shortcuts, drag and drop, OS events
  backend.js                The only module that calls Tauri APIs
  documents.js              DocumentController: open, reload on change, window title
  links.js                  Link click handling (browser / in-app / anchors)
  paths.js, platform.js     Small helpers (POSIX and Windows paths, Cmd vs Ctrl)
  viewers/
    index.js                Viewer registry, keyed by file extension
    markdown/               Markdown viewer: renderer, sanitizing, Mermaid, enhancements
  styles/                   base (chrome + theme), markdown, highlight, print
src-tauri/
  src/lib.rs                App setup, plugins, macOS RunEvent::Opened / Reopen
  src/documents.rs          Queues files opened by the OS until the UI is ready; read_text_file
  src/watcher.rs            File watching (notify) -> "file-changed" event
  src/menu.rs               macOS menu bar
  tauri.conf.json           Shared config: file associations, CSP, bundle settings
  tauri.macos.conf.json     macOS bundle targets (app, dmg)
  tauri.windows.conf.json   Windows bundle target (nsis)
  capabilities/default.json Permissions granted to the window
assets/icon.svg             Source for the app icons
sample.md                   Feature demo
```

### Adding PDF viewing later

Rendering lives in the frontend viewers. To add PDFs:

1. Create `src/viewers/pdf/index.js` that exports a viewer object `{ id, label, extensions: ["pdf"], render(container, path, ctx), dispose() }`, for example built on `pdfjs-dist`. Bundle the PDF.js worker locally.
2. Register it in `src/viewers/index.js`. The open dialog filters and drag and drop pick it up automatically.
3. In Rust, add a `read_binary_file` command next to `read_text_file` in `documents.rs`, or load the PDF through `backend.fileUrl(path)`, since the asset protocol is already enabled.
4. Add `"pdf"` to `bundle.fileAssociations` in `tauri.conf.json`.

Annotations can be stored in a sidecar file, such as `document.pdf.readmark.json`, with a new Rust command to write it.

### Regenerating icons

```sh
npx tauri icon assets/icon.svg
rm -rf src-tauri/icons/android src-tauri/icons/ios   # desktop only
```

## Design decisions

These are choices I made without asking. Change any of them freely.

- **Vite as the bundler.** The code is plain JavaScript with no framework. Vite resolves the npm libraries and bundles them, KaTeX fonts included, into `dist/`, so the app has no runtime network dependencies. Mermaid (about 3 MB) is loaded only when a document contains a diagram.
- **markdown-it** renders the Markdown, using `markdown-it-footnote`, `markdown-it-task-lists` and `@vscode/markdown-it-katex` (the KaTeX plugin VS Code uses). An npm `overrides` entry forces every package onto one patched KaTeX version.
- **Raw HTML in Markdown is allowed**, then sanitized with DOMPurify. `<script>`, `<style>`, `<iframe>`, forms and event handlers are removed. Mermaid runs in `strict` security mode, and its SVG output is also passed through DOMPurify.
- **One document per window.** Opening a file replaces the current one. On Windows, the single instance plugin forwards a second launch's file to the running window.
- **On macOS the app keeps running after its window closes**, as Mac apps usually do. Opening a file or clicking the Dock icon creates a new window. Quit with Cmd+Q.
- **The watcher watches the file's folder, not the file itself.** Many editors save by writing a temp file and renaming it over the original, which would break a watch on the file. Reloads are debounced and keep the scroll position. If the file briefly disappears during a save, the current view stays.
- **The OS can request a file before the page has loaded.** Rust queues those paths, and the frontend fetches them with `frontend_ready` once its listeners are registered, so no file is lost at launch.
- **Asset protocol scope is `**`.** Images next to any document can load. The scope is broad, but this is a local, read-only viewer. The CSP also allows remote `https:` images, which is common in READMEs; remove `https:` from `img-src` in `tauri.conf.json` if you want strictly offline rendering.
- **Mermaid diagrams are rendered twice**, in light and dark themes, and CSS shows the one that matches. Theme changes switch instantly, and printing always uses the light version.
- **The Windows installer is per-user** (`installMode: currentUser`), so it doesn't need administrator rights.
- **Bundle identifier** is `com.readmark.viewer`. Change it before distributing.
- **Code signing** is not set up on either platform.

## Platform notes

- macOS: Finder sends files through `RunEvent::Opened`, both at launch and while the app is running. Command line arguments also work: `Readmark.app/Contents/MacOS/readmark file.md`.
- Windows: Explorer passes the file as a command line argument. `tauri-plugin-single-instance` is registered first, so a second launch hands its arguments to the running instance and exits. Relative paths are resolved against the second instance's working directory.
- I compiled the Windows code paths on macOS during development by temporarily enabling the single instance plugin there, but I haven't run them on Windows yet.
