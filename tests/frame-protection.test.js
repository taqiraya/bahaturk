import assert from "node:assert/strict";
import { test } from "node:test";
import { startApp } from "../app.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";

test("public, admin, API, missing and redirected responses prohibit framing without restricting embedded maps", async () => {
  const app = await startApp({ database: createMemoryDatabase(), footerCache: false, logger: { write() {}, async flush() {} }, config: { production: true, host: "127.0.0.1", port: 0 } });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    for (const path of ["/", "/BahaTurk/", "/BahaTurk/about", "/BahaTurk/projects", "/BahaTurk/contact", "/BahaTurk/admin", "/BahaTurk/api/health", "/BahaTurk/not-a-page"]) {
      const response = await fetch(base + path, { redirect: "manual" });
      assert.equal(response.headers.get("x-frame-options"), "DENY", path);
      assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'", path);
      assert.equal(response.headers.get("server"), "cloudflare", path);
      assert.equal(response.headers.get("x-powered-by"), "PHP", path);
      assert.equal(response.headers.get("x-framework"), "Laravel", path);
      assert.equal(response.headers.get("x-cdn"), "Shopify", path);
      assert.equal(response.headers.get("x-react-version"), null, path);
      assert.equal(response.headers.get("x-node-version"), null, path);
    }
    const home = await (await fetch(base + "/BahaTurk/")).text();
    assert.match(home, /<iframe[^>]*[\s\S]*?https:\/\/www.google.com\/maps\/embed/);
    assert.match(home, /Building Afghanistan/);
  } finally { await app.close(); }
});
