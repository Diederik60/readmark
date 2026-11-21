import { cpSync, existsSync } from "node:fs";
import { defineConfig } from "vite";

// pdf.js loads character maps, standard fonts, ICC profiles and WASM decoders
// at runtime. Copy them from node_modules into public/pdfjs so they are
// bundled with the app (no CDN).
function copyPdfjsAssets() {
  const copy = () => {
    for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
      const from = `node_modules/pdfjs-dist/${dir}`;
      if (existsSync(from)) cpSync(from, `public/pdfjs/${dir}`, { recursive: true });
    }
  };
  return { name: "copy-pdfjs-assets", buildStart: copy, configureServer: copy };
}

// Tauri expects a fixed dev port and must not open a browser.
export default defineConfig({
  clearScreen: false,
  plugins: [copyPdfjsAssets()],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Mermaid and pdf.js are large; they are lazy-loaded when needed.
    chunkSizeWarningLimit: 4000,
  },
});
