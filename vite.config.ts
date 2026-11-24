import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const popupRoot = resolve(projectRoot, "src/popup");

export default defineConfig({
  root: popupRoot,
  plugins: [react()],
  publicDir: resolve(projectRoot, "public"),
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(popupRoot, "index.html"),
        serviceWorker: resolve(projectRoot, "src/background/service-worker.ts"),
        contentScript: resolve(projectRoot, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "serviceWorker") return "background/service-worker.js";
          if (chunk.name === "contentScript") return "content/content-script.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
