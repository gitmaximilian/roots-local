import { defineConfig } from "vite";
import { localOnly } from "./scripts/vite-local-only";

// Cross-origin isolation enables the shared cancel flag between page and worker.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  server: { host: "127.0.0.1", port: 1420, strictPort: true, headers: isolation },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, headers: isolation },
  clearScreen: false,
  worker: { format: "es" },
  build: {
    target: "es2022",
    // Never inline assets as data: URLs; every file is served from this origin.
    assetsInlineLimit: 0,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
  },
  plugins: [localOnly()],
});
