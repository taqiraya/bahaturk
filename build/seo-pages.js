import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { publicDataPlugin } from "./public-data.js";
import { PUBLIC_PAGES } from "../shared/page-metadata.js";
import { discoverPublicPage } from "./seo-discovery.js";

export function seoPagesPlugin() {
  let config;
  return {
    name: "public-page-html",
    configResolved(value) { config = value; },
    async closeBundle() {
      const dist = resolve(config.root, config.build.outDir);
      const manifest = JSON.parse(await readFile(resolve(dist, "route-manifest.json"), "utf8"));
      const renderer = await createServer({ root: config.root, configFile: false, cacheDir: "node_modules/.vite-seo", base: config.base, plugins: [publicDataPlugin(), react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
      try {
        const { renderPublicPage, renderPublicFooter } = await renderer.ssrLoadModule("/src/seo/render.jsx");
        const pages = {};
        let previous = {};
        try { previous = JSON.parse(await readFile(resolve(dist, ".seo-index.json"), "utf8")); } catch { /* First build. */ }
        const index = {};
        for (const route of PUBLIC_PAGES) {
          let html = renderPublicPage(route, config.base);
          for (const [source, asset] of Object.entries(manifest)) {
            if (source.startsWith("src/assets/")) html = html.replaceAll(config.base + source, config.base + asset.file);
          }
          // Small imported illustrations are inlined by the client build, so they
          // have no manifest entry. Inline the same retained source bytes here.
          for (const match of [...html.matchAll(/src\/assets\/[^"\s<>,)]+/g)]) {
            const file = resolve(config.root, match[0]);
            if (!file.startsWith(resolve(config.root, "src/assets") + sep)) throw new Error("Invalid pre-render asset");
            const type = { ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" }[extname(file)];
            if (!type) throw new Error("Unsupported pre-render asset");
            html = html.replaceAll(config.base + match[0], `data:${type};base64,${(await readFile(file)).toString("base64")}`);
          }
          if (html.includes(config.base + "src/")) throw new Error("Unresolved source asset in pre-rendered page: " + route + " " + html.match(/[^"\s<>]*\/src\/[^"\s<>]*/g)?.join(", "));
          pages[route] = html;
          index[route] = await discoverPublicPage(html, route, config.base, dist, previous[route]);
        }
        pages.__footer = renderPublicFooter(config.base);
        await writeFile(resolve(dist, ".seo-pages.json"), JSON.stringify(pages));
        await writeFile(resolve(dist, ".seo-index.json"), JSON.stringify(index));
        const stateFile = resolve(dist, ".build-state.json");
        const state = JSON.parse(await readFile(stateFile, "utf8"));
        await writeFile(stateFile, JSON.stringify({ ...state, seoFingerprint: state.fingerprint }));
        console.log("Pre-rendered all four public pages for crawlers and non-JavaScript access.");
      } finally { await renderer.close(); }
    },
  };
}
