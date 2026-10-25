import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApp } from "../app.js";
import { DEFAULT_FOOTER } from "../shared/footer-settings.js";
import { pageStructuredData, injectPageMetadata } from "../shared/page-metadata.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";
import { confirmedFooterMarkup } from "../shared/seo-footer.js";
import { sitemapXml } from "../shared/sitemap.js";
import { discoverPublicPage } from "../build/seo-discovery.js";
import { injectFooterSnapshot } from "../server/footer-cache.js";

test("confirmed footer HTML preserves literal text, escapes attributes and replaces defaults only once", () => {
  const footer = { ...DEFAULT_FOOTER, address: "Literal $& $' $` <&\"> info@bahaturk.com", phone1: "+93 700 123 456", email: "new@example.invalid", mapUrl: "https://example.invalid/?q=test&lang=en" };
  const template = `<footer><a href="${DEFAULT_FOOTER.mapUrl.replaceAll("&", "&amp;")}">${DEFAULT_FOOTER.address}</a><a href="tel:+93749171717">${DEFAULT_FOOTER.phone1}</a><a href="mailto:${DEFAULT_FOOTER.email}">${DEFAULT_FOOTER.email}</a></footer>`;
  const html = confirmedFooterMarkup(template, footer);
  assert.match(html, /tel:\+93700123456/);
  assert.match(html, /q=test&amp;lang=en/);
  assert.match(html, /mailto:new@example.invalid/);
  assert.ok(html.includes("info@bahaturk.com")); // Part of the new address, not a second replacement.
  assert.ok(!html.includes('<&">'));
  const initial = injectPageMetadata(injectFooterSnapshot("<head><title>Site</title></head><body>original</body>", footer), "contact", "https://bahaturk.com", "/", footer);
  assert.equal(JSON.parse(initial.match(/id="bt-footer-snapshot"[^>]*>([\s\S]*?)<\/script>/)[1]).address, footer.address);
  assert.equal(JSON.parse(initial.match(/id="bt-structured-data"[^>]*>([\s\S]*?)<\/script>/)[1])["@graph"][0].address.streetAddress, footer.address);
  assert.equal((initial.match(/<head>/g) || []).length, 1);
});

test("image discovery excludes missing, inline and decorative files and retains genuine content modification dates", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-image-sitemap-"));
  await mkdir(join(root, "images"));
  await writeFile(join(root, "images/photo.webp"), Buffer.alloc(12000));
  await writeFile(join(root, "images/hero.jpg"), Buffer.alloc(12000));
  await writeFile(join(root, "images/icon.webp"), Buffer.alloc(100));
  const html = '<h1>Same real content</h1><img src="/BahaTurk/images/photo.webp"><img src="/BahaTurk/images/photo.webp"><img src="/BahaTurk/images/icon.webp"><img src="/BahaTurk/images/missing.webp"><img src="data:image/webp;base64,AA"><div style="background-image:url(&quot;/BahaTurk/images/hero.jpg&quot;)"></div>';
  const first = await discoverPublicPage(html, "", "/BahaTurk/", root, null, "2026-10-23T10:00:00.000Z");
  assert.deepEqual(first.images, ["images/hero.jpg", "images/photo.webp"]);
  const rebuilt = await discoverPublicPage(html, "", "/BahaTurk/", root, first, "2026-10-24T10:00:00.000Z");
  assert.equal(rebuilt.lastmod, first.lastmod);
  const changed = await discoverPublicPage(html.replace("Same real content", "Updated real content"), "", "/BahaTurk/", root, first, "2026-10-24T10:00:00.000Z");
  assert.notEqual(changed.lastmod, first.lastmod);
  const xml = sitemapXml("https://bahaturk.com", "/", { "": first, admin: { images: ["private.jpg"] }, contact: { images: ["../private.jpg", "https://external.invalid/image.jpg"] } });
  assert.match(xml, /<image:loc>https:\/\/bahaturk.com\/images\/photo.webp<\/image:loc>/);
  assert.match(xml, /<lastmod>2026-10-23T10:00:00.000Z<\/lastmod>/);
  assert.ok(!xml.includes("private.jpg")); assert.ok(!xml.includes("external.invalid"));
});

test("structured data uses confirmed business details and safely serializes hostile address text", () => {
  const footer = { ...DEFAULT_FOOTER, address: 'Original address </script><script>alert(1)</script>', email: "current@example.invalid", phone1: "+93 700 123 456" };
  const input = '<head><title>Old</title></head><body>same visible content</body>';
  const html = injectPageMetadata(input, "contact", "https://business.example.invalid", "/BahaTurk/", footer);
  const data = JSON.parse(html.match(/<script id="bt-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data["@graph"][0].email, footer.email);
  assert.equal(data["@graph"][0].address.streetAddress, footer.address);
  assert.equal(data["@graph"][2]["@type"], "ContactPage");
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.endsWith("<body>same visible content</body>"));
  assert.equal((injectPageMetadata(html, "about", "https://business.example.invalid").match(/id="bt-structured-data"/g) || []).length, 1);
  assert.equal(pageStructuredData("admin", "https://business.example.invalid"), null);
  assert.equal(pageStructuredData("missing", "https://business.example.invalid"), null);
});

test("public HTML is available without scripts; admin and API are noindex and duplicate URLs redirect", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-seo-html-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/index.html"), '<head><title>Old</title></head><body><div id="root"><!--bt-page-content--></div></body>');
  await writeFile(join(root, "dist/.seo-pages.json"), JSON.stringify({ "": "<h1>Existing home content</h1>", contact: "<h1>Existing contact content</h1>" }));
  const app = await startApp({ root, database: createMemoryDatabase(), footerCache: { async read() { return DEFAULT_FOOTER; } }, logger: { write() {}, async flush() {} }, config: { production: true, host: "127.0.0.1", port: 0, publicSiteUrl: "https://business.example.invalid" } });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}/BahaTurk/`;
    const html = await (await fetch(base + "contact?utm_source=test")).text();
    assert.match(html, /<h1>Existing contact content<\/h1>/);
    assert.match(html, /rel="canonical" href="https:\/\/business.example.invalid\/BahaTurk\/contact"/);
    assert.equal((await fetch(base + ".seo-pages.json")).status, 404);
    for (const path of ["admin", "missing", "api/health"]) assert.equal((await fetch(base + path)).headers.get("x-robots-tag"), "noindex, nofollow");
    const duplicate = await fetch(base + "index.html?utm_source=test", { redirect: "manual" });
    assert.equal(duplicate.status, 308); assert.equal(duplicate.headers.get("location"), "/BahaTurk/?utm_source=test");
    for (const path of ["robots.txt", "sitemap.xml"]) {
      const response = await fetch(base + path, { method: "HEAD" });
      assert.equal(response.status, 200); assert.equal(await response.text(), "");
    }
    await writeFile(join(root, "dist/.seo-pages.json"), JSON.stringify({ contact: "<h1>Updated public build content</h1>" }));
    assert.match(await (await fetch(base + "contact")).text(), /Updated public build content/);
    assert.ok(!(await (await fetch(base + "admin")).text()).includes("Existing home content"));
  } finally { await app.close(); }
});

test("a root-hosted build serves bahaturk.com paths without subfolder redirects or canonical drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-seo-domain-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/.build-state.json"), JSON.stringify({ base: "/" }));
  await writeFile(join(root, "dist/.seo-pages.json"), JSON.stringify({ "": "<h1>Public home</h1>", about: "<h1>Public about</h1>" }));
  await writeFile(join(root, "dist/index.html"), '<head><title>Site</title></head><body><!--bt-page-content--></body>');
  const app = await startApp({ root, database: createMemoryDatabase(), footerCache: false, logger: { write() {}, async flush() {} }, config: { production: true, host: "127.0.0.1", port: 0, publicSiteUrl: "https://bahaturk.com", publicSitePath: "/" } });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    for (const path of ["/", "/about", "/projects", "/contact", "/robots.txt", "/sitemap.xml"]) assert.equal((await fetch(base + path, { redirect: "manual" })).status, 200);
    const html = await (await fetch(base + "/about")).text();
    assert.match(html, /rel="canonical" href="https:\/\/bahaturk.com\/about"/);
    assert.match(html, /Public about/); assert.ok(!html.includes("/BahaTurk/"));
    const sitemap = await (await fetch(base + "/sitemap.xml")).text();
    assert.match(sitemap, /<loc>https:\/\/bahaturk.com\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/bahaturk.com\/projects<\/loc>/);
    assert.equal((await fetch(base + "/does-not-exist")).status, 404);
    for (const path of ["/BahaTurk", "/BahaTurk/", "/BahaTurk/about", "/BahaTurk/contact?source=old", "/BahaTurk/api/health"]) {
      const legacy = await fetch(base + path, { redirect: "manual" });
      assert.equal(legacy.status, 308);
      assert.equal(legacy.headers.get("location"), path.slice("/BahaTurk".length) || "/");
    }
    const safe = await fetch(base + "/BahaTurk//outside.example/path", { redirect: "manual" });
    assert.equal(safe.headers.get("location"), "/outside.example/path");
  } finally { await app.close(); }
});
