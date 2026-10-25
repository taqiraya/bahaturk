import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectPageMetadata, pageMetadata, PUBLIC_PAGES } from "../shared/page-metadata.js";
import { inspectStorage } from "../server/storage-monitor.js";
import { startApp } from "../app.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";

test("public routes have distinct canonical metadata while admin/unknown pages are noindex", () => {
  const titles = PUBLIC_PAGES.map((route) => pageMetadata(route, "https://example.invalid").title);
  assert.equal(new Set(titles).size, 4);
  assert.equal(pageMetadata("about", "https://example.invalid").canonical, "https://example.invalid/BahaTurk/about");
  for (const route of ["admin", "missing", "constructor"]) assert.equal(pageMetadata(route, "https://example.invalid").index, false);
  const html = injectPageMetadata('<head><title>old</title></head><body>same content</body>', "contact", "https://example.invalid");
  assert.match(html, /<title>Contact Baha Turk<\/title>/);
  assert.match(html, /property="og:image"/);
  assert.ok(html.endsWith("<body>same content</body>"));
  const twice = injectPageMetadata(html, "projects", "https://example.invalid");
  assert.equal((twice.match(/name="description"/g) || []).length, 1);
});

test("storage monitoring includes releases, preserved originals and dist without deleting files", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-full-storage-"));
  for (const directory of ["dist", "releases", ".media-originals"]) {
    await mkdir(join(root, directory)); await writeFile(join(root, directory, "retained.txt"), "original data");
  }
  const status = await inspectStorage(root, { async storageStats() { return { databaseBytes: 0, retiredSessions: 0 }; } }, { workspaceBytes: 1, minFreeBytes: Number.MAX_SAFE_INTEGER });
  for (const directory of ["dist", "releases", ".media-originals"]) {
    assert.equal(status.folders[directory], 13);
    assert.equal(await readFile(join(root, directory, "retained.txt"), "utf8"), "original data");
  }
  assert.ok(status.warnings.includes("workspace_storage"));
  assert.ok(status.warnings.includes(status.diskFreeBytes === null ? "disk_space_unknown" : "disk_free_space"));
});

test("clean public URLs reload with route-specific HTML, with sitemap and admin excluded from indexing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-seo-routes-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/index.html"), "<head><title>Baha Turk</title></head><body>unchanged design</body>");
  const app = await startApp({ root, database: createMemoryDatabase(), footerCache: false, logger: { write() {}, async flush() {} }, config: { production: true, host: "127.0.0.1", port: 0, publicSiteUrl: "https://business.example.invalid" } });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    for (const route of PUBLIC_PAGES) {
      const response = await fetch(base + "/BahaTurk/" + route);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /business\.example\.invalid/);
      assert.ok(html.endsWith("<body>unchanged design</body>"));
    }
    assert.equal((await fetch(base + "/BahaTurk/unknown")).status, 404);
    assert.match(await (await fetch(base + "/BahaTurk/admin")).text(), /noindex,nofollow/);
    const sitemap = await (await fetch(base + "/BahaTurk/sitemap.xml")).text();
    assert.match(sitemap, /BahaTurk\/contact/); assert.ok(!sitemap.includes("/admin"));
    assert.match(await (await fetch(base + "/robots.txt")).text(), /Disallow: \/BahaTurk\/admin/);
    assert.equal((await fetch(base + "/BahaTurk/about/", { redirect: "manual" })).status, 308);
  } finally { await app.close(); }
});
