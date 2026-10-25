// Explicit local MySQL integration check. All synthetic inserts are rolled back.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { parseEnv } from "node:util";
import { startApp } from "../app.js";
import { loadConfig, verifyPassword } from "../server/config.js";
import { connectDatabase, createContactRepository } from "../server/database.js";

const root = resolve(import.meta.dirname, "..");
const config = loadConfig(root);
const dbJson = await readFile(resolve(root, "db.json"), "utf8");
const database = await connectDatabase(config.database);
const before = (await database.listMessages()).total;
const connection = await mysql.createConnection(config.database);
await connection.beginTransaction();
let app;
try {
  const repository = createContactRepository(connection);
  app = await startApp({ config: { ...config, production: true, port: 0 }, database: repository, footerCache: false });
  const base = `http://127.0.0.1:${app.server.address().port}/BahaTurk/api`;
  const input = { requestId: randomUUID(), fullName: "آزمایش بدون ذخیرهٔ دائمی", phoneNumber: "+93 700000000", emailAddress: "integration@example.invalid", subject: "Transactional verification", message: "متن فارسی و emoji 🏗️\n<script>example</script>\n' OR 1=1 --" };
  const post = () => fetch(base + "/contact-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const first = await post(); assert.equal(first.status, 201); const saved = await first.json();
  assert.equal((await post()).status, 200);
  const conflict = await fetch(base + "/contact-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, message: "Different message" }) });
  assert.equal(conflict.status, 409);
  assert.equal((await fetch(base + "/admin/messages")).status, 401);
  const accessFiles = (await readdir(root)).filter((name) => /^\.env\.admin-access(?:\.[\w-]+)?\.local$/.test(name)).sort();
  let access;
  for (const file of accessFiles) {
    const candidate = parseEnv(await readFile(resolve(root, file), "utf8"));
    if (await verifyPassword(candidate.ADMIN_PASSWORD, config.adminPasswordHash)) { access = candidate; break; }
  }
  assert.ok(access, "An existing private credential file must match the configured password.");
  const login = await fetch(base + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: access.ADMIN_USERNAME, password: access.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const listed = await (await fetch(base + "/admin/messages", { headers: { Cookie: cookie } })).json();
  assert.equal(listed.total, before + 1);
  assert.equal(listed.messages.find((item) => item.id === saved.id).message, input.message);
  assert.equal((await fetch(base + "/admin/messages?page=0", { headers: { Cookie: cookie } })).status, 400);
  for (const file of [".env.local", ".env.admin-access.local", "server/config.js", "app.js"]) assert.equal((await fetch(`http://127.0.0.1:${app.server.address().port}/BahaTurk/${file}`)).status, 404);
  const footerBefore = await repository.getFooter();
  const footerState = await repository.getFooterState();
  const changed = { ...footerBefore, address: "Transactional footer verification" };
  assert.equal((await fetch(base + "/admin/footer", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ revision: footerState.revision, settings: changed }) })).status, 403);
  const savedFooter = await fetch(base + "/admin/footer", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": session.csrf }, body: JSON.stringify({ revision: footerState.revision, settings: changed }) });
  assert.equal(savedFooter.status, 200);
  assert.deepEqual(await (await fetch(base + "/footer")).json(), changed);
  const stale = await fetch(base + "/admin/footer", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": session.csrf }, body: JSON.stringify({ revision: footerState.revision, settings: footerBefore }) });
  assert.equal(stale.status, 409);
  assert.ok((await repository.footerHistory()).some((row) => row.settings.address === footerBefore.address));
  const secondRepository = createContactRepository(connection);
  assert.deepEqual(await secondRepository.getFooter(), changed);
  const tokenHash = createHash("sha256").update(cookie.slice("bt_admin=".length)).digest("hex");
  assert.equal((await secondRepository.getSession(tokenHash, config.adminCredentialVersion, Date.now())).username, config.adminUsername);
  const key = createHash("sha256").update(randomUUID()).digest("hex");
  assert.equal(await repository.consumeLimit(key, 2, 1000, 10000), true);
  assert.equal(await secondRepository.consumeLimit(key, 2, 1000, 10000), true);
  assert.equal(await repository.consumeLimit(key, 2, 1000, 10000), false);
  assert.equal(await secondRepository.consumeLimit(key, 2, 1000, 11001), true);
  console.log("PASS: append-only footer settings, CSRF and shared SQL rate limits (transactional).");
  console.log("PASS: HTTP form -> MySQL -> authenticated admin; Persian/emoji, SQL parameters, duplicate retry, conflict and private files.");
} finally {
  await connection.rollback();
  if (app) await app.close(); else await connection.end();
  assert.equal((await database.listMessages()).total, before);
  assert.equal(await readFile(resolve(root, "db.json"), "utf8"), dbJson);
  await database.close();
  console.log("PASS: synthetic insert rolled back; existing messages and db.json unchanged.");
}
