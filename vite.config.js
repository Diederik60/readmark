import { defineConfig } from "vite";

// Tauri expects a fixed dev port and must not open a browser.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Mermaid is large; it is lazy-loaded only when a diagram is present.
    chunkSizeWarningLimit: 4000,
  },
});
