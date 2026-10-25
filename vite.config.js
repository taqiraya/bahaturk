import { buildStatePlugin } from "./build/build-state.js";
import { compressedAssetsPlugin } from "./build/compressed-assets.js";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { publicDataPlugin } from "./build/public-data.js";
import { seoPagesPlugin } from "./build/seo-pages.js";

export default defineConfig({
  plugins: [publicDataPlugin(), react(), tailwindcss(), compressedAssetsPlugin(), buildStatePlugin(), seoPagesPlugin()],
  base: process.env.SITE_BASE_PATH || "/",
  build: { emptyOutDir: false, manifest: "route-manifest.json" },
  preview: { port: 3000, strictPort: true },
  server: {
    port: 3000,
    strictPort: true,
  },
});
