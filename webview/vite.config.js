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
                manualChunks: function (id) {
                    if (id.includes("node_modules")) {
                        if (id.includes("@tiptap") || id.includes("prosemirror")) {
                            return "vendor-editor";
                        }
                        if (id.includes("dompurify")) {
                            return "vendor-sanitize";
                        }
                        // React, react-dom and every other vendor package (including
                        // internal React runtime deps like "scheduler") are kept in one
                        // chunk. Splitting React from packages it depends on internally
                        // can leave its module reference unresolved at chunk-init time,
                        // which surfaces in the webview as:
                        // "Cannot read properties of undefined (reading 'useState')".
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
                assetFileNames: function (assetInfo) {
                    if (assetInfo.name && assetInfo.name.endsWith(".css")) {
                        return "assets/index.css";
                    }
                    return "assets/[name][extname]";
                },
            },
        },
    },
});
