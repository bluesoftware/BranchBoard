import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds a single, dependency-free bundle into webview/dist with stable
// filenames (assets/index.js + assets/index.css) so the extension can
// reference them directly. No external CDNs are used.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "assets/index.css";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
});
