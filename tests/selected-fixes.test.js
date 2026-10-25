import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { hashPassword, loadConfig, verifyPassword } from "../server/config.js";
import { createFooterCache, injectFooterSnapshot } from "../server/footer-cache.js";
import { createLogger } from "../server/logger.js";
import { inspectStorage } from "../server/storage-monitor.js";
import { DEFAULT_FOOTER } from "../shared/footer-settings.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";

test("hosting password overrides a local hash without editing the credential file", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-env-priority-"));
  const text = `ADMIN_PASSWORD_HASH=${hashPassword("old-local-password")}\n`;
  await writeFile(join(root, ".env.local"), text);
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousHash = process.env.ADMIN_PASSWORD_HASH;
  try {
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD = "host-password";
    assert.equal(await verifyPassword("host-password", loadConfig(root).adminPasswordHash), true);
    process.env.ADMIN_PASSWORD_HASH = hashPassword("host-hash-password");
    assert.equal(await verifyPassword("host-hash-password", loadConfig(root).adminPasswordHash), true);
    assert.equal(await readFile(join(root, ".env.local"), "utf8"), text);
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousHash === undefined) delete process.env.ADMIN_PASSWORD_HASH; else process.env.ADMIN_PASSWORD_HASH = previousHash;
  }
});

test("footer snapshots survive restart, ignore partial writes and see another worker's update", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-footer-cache-"));
  const first = createFooterCache(root);
  await first.write(DEFAULT_FOOTER, "1");
  const changed = { ...DEFAULT_FOOTER, email: "new@example.invalid" };
  await createFooterCache(root).write(changed, "2");
  assert.deepEqual(await first.read(), changed);
  await writeFile(join(root, ".runtime", "footer-cache", `3-${"a".repeat(64)}.json`), "{");
  assert.deepEqual(await createFooterCache(root).read(), changed);
  assert.equal((await readdir(join(root, ".runtime", "footer-cache"))).length, 3);
});

test("HTML supplies confirmed footer details to a new browser without permitting script injection", () => {
  const settings = { ...DEFAULT_FOOTER, address: "</script><script>alert(1)</script>" };
  const html = injectFooterSnapshot("<head></head><body></body>", settings);
  assert.equal((html.match(/<script/g) || []).length, 1);
  const encoded = html.match(/type="application\/json">(.*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(encoded), settings);
  assert.equal(injectFooterSnapshot("<head></head>", null), "<head></head>");
});

test("stale footer edits are rejected and the original versions remain recoverable", async () => {
  const database = createMemoryDatabase();
  const initial = await database.getFooterState();
  const changed = { ...initial.settings, address: "A new address" };
  const saved = await database.saveFooter(changed, initial.revision);
  await assert.rejects(database.saveFooter({ ...changed, address: "Stale" }, initial.revision), { status: 409 });
  const restored = await database.saveFooter(initial.settings, saved.revision);
  assert.deepEqual(restored.settings, initial.settings);
  assert.deepEqual((await database.footerHistory()).map((row) => row.settings), [initial.settings, changed, initial.settings]);
});

test("compressed operational logs retain every event and storage warnings never remove records", async () => {
  const root = await mkdtemp(join(tmpdir(), "bt-logs-"));
  await mkdir(join(root, ".runtime"));
  const legacy = join(root, ".runtime", "old-events.jsonl");
  await writeFile(legacy, '{"event":"retained"}\n');
  const logger = createLogger(root);
  logger.write("first", { status: 200 }); logger.write("second", { status: 503 });
  await logger.flush();
  const files = (await readdir(join(root, ".runtime"))).filter((file) => file.endsWith(".gz"));
  const content = await promisify(gunzip)(await readFile(join(root, ".runtime", files[0])));
  assert.deepEqual(content.toString().trim().split("\n").map((line) => JSON.parse(line).event), ["first", "second"]);
  const database = { async storageStats() { return { databaseBytes: 1234, retiredSessions: 5 }; } };
  const status = await inspectStorage(root, database, { runtimeBytes: 1, databaseBytes: 1, retiredSessions: 1 });
  assert.deepEqual(status.warnings, ["runtime_storage", "database_storage", "retained_sessions"]);
  assert.equal(await readFile(legacy, "utf8"), '{"event":"retained"}\n');
});
