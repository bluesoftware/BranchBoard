import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Keep stable entry filenames for the VS Code webview HTML while allowing
// lazy routes and heavy editor/vendor code to split into separate chunks.
// No external CDNs are used.
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
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tiptap") || id.includes("prosemirror")) {
              return "vendor-editor";
            }
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("dompurify")) {
              return "vendor-sanitize";
            }
            return "vendor";
          }
          if (id.includes("/webview/src/pages/")) {
            return "pages";
          }
          if (id.includes("/webview/src/components/dashboard/") || id.includes("/webview/src/components/branchMap/")) {
            return "dashboard";
          }
          return undefined;
        },
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
