import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { chooseEncoding } from "../server/static-response.js";
import { startApp } from "../app.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";
import { loadConfig, hashPassword } from "../server/config.js";

test("encoding negotiation respects q=0, preference and identity fallback", () => {
  for (const [header, expected] of [[undefined, "identity"], ["br, gzip", "br"], ["br;q=0,gzip;q=1", "gzip"], ["br;q=0.2,gzip;q=0.9", "gzip"], ["gzip;q=0,br;q=0", "identity"], ["*;q=0", null], ["gzip;q=0.5,identity;q=1", "identity"]]) assert.equal(chooseEncoding(header), expected);
  assert.equal(chooseEncoding("br,gzip", []), "identity");
});

test("production assets use negotiated precompression, conditional caching and correct HEAD responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-compressed-"));
  await mkdir(join(root, "dist/assets"), { recursive: true });
  const html = "<!doctype html><head></head><body>Original appearance</body>";
  const javascript = 'console.log("the same script");\n'.repeat(100);
  await writeFile(join(root, "dist/index.html"), html);
  await writeFile(join(root, "dist/assets/main.js"), javascript);
  await writeFile(join(root, "dist/assets/main.js.br"), brotliCompressSync(javascript));
  await writeFile(join(root, "dist/assets/main.js.gz"), gzipSync(javascript));
  const app = await startApp({ root, database: createMemoryDatabase(), footerCache: false, logger: { write() {}, async flush() {} }, config: { production: true, host: "127.0.0.1", port: 0 } });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}/BahaTurk/`;
    const request = (encoding, options = {}) => fetch(base + "assets/main.js", { ...options, headers: { "Accept-Encoding": encoding, ...options.headers } });
    for (const [accept, encoding] of [["br,gzip", "br"], ["br;q=0,gzip", "gzip"], ["identity", null]]) {
      const response = await request(accept);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-encoding"), encoding);
      assert.equal(await response.text(), javascript);
      const cached = await request(accept, { headers: { "If-None-Match": response.headers.get("etag") } });
      assert.equal(cached.status, 304);
      assert.equal(await cached.text(), "");
      const head = await request(accept, { method: "HEAD" });
      assert.equal(head.headers.get("content-length"), response.headers.get("content-length"));
      assert.equal(await head.text(), "");
    }
    assert.equal((await request("*;q=0")).status, 406);
    const page = await fetch(base, { headers: { "Accept-Encoding": "br" } });
    assert.equal(page.headers.get("content-encoding"), "br");
    const rendered = await page.text();
    assert.equal(rendered.slice(rendered.indexOf("<body>")), "<body>Original appearance</body>");
    assert.match(rendered, /property="og:title"/);
    assert.equal(await readFile(join(root, "dist/assets/main.js"), "utf8"), javascript);
  } finally { await app.close(); }
});

test("normal startup defaults to production and keeps port 3000", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-production-"));
  await writeFile(join(root, ".env.local"), `ADMIN_PASSWORD_HASH=${hashPassword("test-only")}\n`);
  const config = loadConfig(root);
  assert.equal(config.production, process.env.NODE_ENV !== "development");
  assert.equal(config.port, Number(process.env.PORT || 3000));
});
