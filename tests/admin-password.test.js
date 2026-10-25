import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { startApp } from "../app.js";
import { hashPassword, verifyPassword } from "../server/config.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";

const initial = "Initial-test-password-۱۲۳";
async function fixture(t) {
  const database = createMemoryDatabase(), events = [];
  const config = { production: true, host: "127.0.0.1", port: 0, adminUsername: "password-test-admin", adminPasswordHash: hashPassword(initial) };
  const apps = [];
  async function worker() {
    const app = await startApp({ database, config, footerCache: false, logger: { write(...event) { events.push(event); }, async flush() {} } });
    apps.push(app);
    return `http://127.0.0.1:${app.server.address().port}/api`;
  }
  t.after(async () => { for (const app of apps) await app.close(); });
  const base = await worker();
  async function login(password = initial, origin = base) {
    const response = await fetch(origin + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: config.adminUsername, password }) });
    return { response, cookie: response.headers.get("set-cookie")?.split(";")[0], body: await response.json() };
  }
  function change(session, body, headers = {}) {
    return fetch(base + "/admin/password", { method: "POST", headers: { "Content-Type": "application/json", Cookie: session.cookie || "", "X-CSRF-Token": session.body.csrf || "", ...headers }, body: JSON.stringify(body) });
  }
  return { database, config, events, worker, base, login, change };
}

test("password changes require authentication, CSRF, current password and matching strong-enough confirmation", async (t) => {
  const app = await fixture(t), session = await app.login();
  const body = { currentPassword: initial, newPassword: "New-test-password-۱۲۳", confirmPassword: "New-test-password-۱۲۳" };
  assert.equal((await app.change({ body: {} }, body)).status, 401);
  assert.equal((await app.change(session, body, { "X-CSRF-Token": "" })).status, 403);
  assert.equal((await app.change(session, { ...body, currentPassword: "wrong" })).status, 422);
  assert.equal((await app.change(session, { ...body, newPassword: "short", confirmPassword: "short" })).status, 422);
  assert.equal((await app.change(session, { ...body, confirmPassword: "different" })).status, 422);
  assert.equal((await app.change(session, body, { Origin: "https://other.invalid" })).status, 403);
  assert.equal((await app.login()).response.status, 200);
});

test("changed password persists across workers, invalidates old sessions and preserves business records", async (t) => {
  const app = await fixture(t), second = await app.worker();
  await app.database.addMessage({ requestId: randomUUID(), fullName: "Retained", message: "Real record placeholder", emailAddress: "test@example.invalid" });
  const before = JSON.stringify(app.database.rows), footer = await app.database.getFooter();
  const firstSession = await app.login(), secondSession = await app.login(initial, second);
  const password = "Changed-password-۱۲۳";
  const changed = await app.change(firstSession, { currentPassword: initial, newPassword: password, confirmPassword: password });
  assert.equal(changed.status, 200); assert.match(changed.headers.get("set-cookie"), /Max-Age=0/);
  for (const [base, session] of [[app.base, firstSession], [second, secondSession]]) assert.equal((await fetch(base + "/admin/session", { headers: { Cookie: session.cookie } })).status, 401);
  assert.equal((await app.login(initial)).response.status, 401);
  assert.equal((await app.login(password, second)).response.status, 200);
  assert.equal((await app.login(password, await app.worker())).response.status, 200);
  const baseVersion = createHash("sha256").update(app.config.adminPasswordHash).digest("hex");
  const stored = await app.database.getAdminCredentials(app.config.adminUsername, baseVersion);
  assert.notEqual(stored.passwordHash, password); assert.equal(await verifyPassword(password, stored.passwordHash), true);
  assert.equal(JSON.stringify(app.database.rows), before); assert.deepEqual(await app.database.getFooter(), footer);
  assert.ok(!JSON.stringify(app.events).includes(password));
});

test("failed password storage never confirms success or replaces the old password", async (t) => {
  const app = await fixture(t), session = await app.login();
  app.database.changeAdminPassword = async () => { throw new Error("storage unavailable"); };
  assert.equal((await app.change(session, { currentPassword: initial, newPassword: "Not-saved-password", confirmPassword: "Not-saved-password" })).status, 503);
  assert.equal((await app.login()).response.status, 200);
  assert.equal((await app.login("Not-saved-password")).response.status, 401);
});

test("simultaneous password changes cannot overwrite each other", async (t) => {
  const app = await fixture(t), session = await app.login();
  const responses = await Promise.all(["Concurrent-password-1", "Concurrent-password-2"].map((password) => app.change(session, { currentPassword: initial, newPassword: password, confirmPassword: password })));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.ok(responses.some((response) => [401, 409].includes(response.status)));
});
