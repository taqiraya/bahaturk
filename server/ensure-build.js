import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function ensureProductionBuild(root) {
  // Hosting releases contain a ready dist and no source or build dependencies.
  if (!existsSync(resolve(root, "src/main.jsx"))) return;
  const { productionFingerprint } = await import("../build/fingerprint.js");
  const current = await productionFingerprint(root);
  try {
    const state = JSON.parse(await readFile(resolve(root, "dist/.build-state.json"), "utf8"));
    if (state.fingerprint === current && state.seoFingerprint === current && state.base === (process.env.SITE_BASE_PATH || "/") && existsSync(resolve(root, "dist/index.html")) && existsSync(resolve(root, "dist/.seo-pages.json")) && existsSync(resolve(root, "dist/.seo-index.json"))) return;
  } catch { /* First run or changed source: prepare a complete production build. */ }
  console.log("Preparing the optimized website. Existing data and older assets are retained.");
  const { build } = await import("vite");
  await build({ root, build: { emptyOutDir: false } });
}
