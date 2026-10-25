import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, stat, copyFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startApp } from "../app.js";
import { createResilientDatabase } from "../server/database.js";
import { getClientIp } from "../server/client-ip.js";
import { loadConfig, verifyPassword } from "../server/config.js";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";

test("public pages and admin login API still work during database outage, then storage recovers", async () => {
  let available = false;
  let attempts = 0;
  const saved = [];
  const database = createResilientDatabase({}, async () => {
    attempts++;
    if (!available) throw new Error("MySQL offline");
    return { async consumeLimit() { return true; }, async addMessage(input) { saved.push(input); return { id: "1" }; }, async close() {} };
  }, 0);
  const root = await mkdtemp(join(tmpdir(), "bahaturk-outage-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "index.html"), "<!doctype html><title>Public website</title>");
  const app = await startApp({ root, database, config: { host: "127.0.0.1", port: 0, production: true } });
  try {
    assert.equal(attempts, 0, "startup must not connect to MySQL");
    const base = `http://127.0.0.1:${app.server.address().port}/BahaTurk/`;
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + "api/admin/session")).status, 401);
    const input = { requestId: randomUUID(), fullName: "Test", emailAddress: "test@example.invalid", message: "Preserve my message" };
    const send = () => fetch(base + "api/contact-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal((await send()).status, 503);
    assert.equal(saved.length, 0);
    available = true;
    assert.equal((await send()).status, 201);
    assert.equal(saved[0].message, input.message);
    assert.equal(attempts, 2);
  } finally { await app.close(); }
});

test("simultaneous first requests share one database initialization", async () => {
  let attempts = 0;
  let releases = 0;
  const database = createResilientDatabase({}, async () => {
    attempts++;
    await new Promise((done) => setTimeout(done, 10));
    return { async listMessages() { return { total: 0 }; }, async close() { releases++; } };
  });
  await Promise.all([database.listMessages(), database.listMessages(), database.listMessages()]);
  await database.close();
  assert.equal(attempts, 1);
  assert.equal(releases, 1);
});

test("lost local configuration recovers the SAME admin login without replacing credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "bahaturk-recovery-"));
  const filename = join(root, ".env.admin-access.local");
  const content = 'ADMIN_USERNAME=owner\nADMIN_PASSWORD="keep-this-existing-password"\n';
  await writeFile(filename, content);
  const before = (await stat(filename)).mtimeMs;
  const config = loadConfig(root);
  assert.equal(config.adminUsername, "owner");
  assert.equal(await verifyPassword("keep-this-existing-password", config.adminPasswordHash), true);
  assert.equal(await readFile(filename, "utf8"), content);
  assert.equal((await stat(filename)).mtimeMs, before);
  assert.ok((await readFile(join(root, ".env.local"), "utf8")).includes("ADMIN_PASSWORD_HASH="));
});

test("proxy chain stops at the nearest untrusted hop and handles IPv4-mapped sockets", () => {
  const req = { socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.99, 198.51.100.7" } };
  assert.equal(getClientIp(req, ["127.0.0.1"]), "198.51.100.7");
  assert.equal(getClientIp(req, []), "127.0.0.1");
  req.headers["x-forwarded-for"] = "invalid";
  assert.equal(getClientIp(req, ["127.0.0.1"]), "127.0.0.1");
});

test("explicit admin recovery retains old files and recovery chooses the new login", async () => {
  const root = await mkdtemp(join(tmpdir(), "bahaturk-reset-"));
  await mkdir(join(root, "server"));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  for (const file of ["config.js", "admin-password.js"]) await copyFile(new URL(`../server/${file}`, import.meta.url), join(root, "server", file));
  const previous = 'ADMIN_USERNAME=owner\nADMIN_PASSWORD="previous-password"\n';
  await writeFile(join(root, ".env.admin-access.local"), previous);
  await promisify(execFile)(process.execPath, [join(root, "server", "admin-password.js")]);
  assert.equal(await readFile(join(root, ".env.admin-access.local"), "utf8"), previous);
  const files = (await readdir(root)).filter((name) => name.startsWith(".env.admin-access"));
  assert.equal(files.length, 2);
  const latest = files.find((name) => name !== ".env.admin-access.local");
  const login = parseEnv(await readFile(join(root, latest), "utf8"));
  assert.equal(await verifyPassword(login.ADMIN_PASSWORD, loadConfig(root).adminPasswordHash), true);
  // Simulate loss of the hash config in a DIFFERENT temporary folder. No file is deleted.
  const recovered = await mkdtemp(join(tmpdir(), "bahaturk-new-login-"));
  for (const file of files) await copyFile(join(root, file), join(recovered, file));
  assert.equal(await verifyPassword(login.ADMIN_PASSWORD, loadConfig(recovered).adminPasswordHash), true);
});
