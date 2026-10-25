import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { createApi } from "../server/api.js";
import { hashPassword } from "../server/config.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";
import { createFooterCache } from "../server/footer-cache.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const credentials = { username: "test-admin", password: "test-password-with-unicode-۱۲۳" };
const adminPasswordHash = hashPassword(credentials.password);
const message = () => ({ requestId: randomUUID(), fullName: "نام آزمایشی", emailAddress: "test@example.invalid", phoneNumber: "+93 700 000 000", subject: "Contact test", message: "متن فارسی\n<script>alert('test')</script>" });

async function fixture(t, configOverrides = {}) {
  const database = createMemoryDatabase();
  const rows = database.rows;
  let clock = Date.now();
  const footerCache = createFooterCache(await mkdtemp(join(tmpdir(), "bt-api-cache-")));
  const api = createApi({ database, footerCache, config: { adminUsername: credentials.username, adminPasswordHash, ...configOverrides }, now: () => clock });
  const server = createServer((req, res) => { void api(req, res, new URL(req.url, "http://localhost")); });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(origin + path, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const login = async () => {
    const response = await request("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get("set-cookie").split(";")[0], session: await response.json(), response };
  };
  return { request, rows, database, login, advance: (duration) => { clock += duration; } };
}

test("messages are saved, repeated submissions are idempotent, and only admins can read them", async (t) => {
  const app = await fixture(t);
  const input = message();
  assert.equal((await app.request("/api/admin/messages")).status, 401);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify(input) })).status, 201);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify(input) })).status, 200);
  assert.equal(app.rows.length, 1);
  const { cookie, response } = await app.login();
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const result = await (await app.request("/api/admin/messages", { headers: { Cookie: cookie } })).json();
  assert.equal(result.total, 1);
  assert.equal(result.messages[0].message, input.message);
  assert.equal(result.messages[0].fullName, input.fullName);
});

test("invalid, oversized and cross-site requests never reach storage", async (t) => {
  const app = await fixture(t);
  for (const input of [{ ...message(), fullName: " " }, { ...message(), emailAddress: "invalid" }, { ...message(), message: "x".repeat(10001) }, { ...message(), requestId: "invalid" }, { ...message(), fullName: {} }]) {
    assert.equal((await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify(input) })).status, 422);
  }
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: "{" })).status, 400);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify(message()), headers: { Origin: "https://other.example" } })).status, 403);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify({ message: "x".repeat(70000) }) })).status, 413);
  assert.equal(app.rows.length, 0);
});

test("database failure cannot produce a false success", async (t) => {
  const app = await fixture(t);
  app.database.fail = true;
  const response = await app.request("/api/contact-messages", { method: "POST", body: JSON.stringify(message()) });
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
  assert.equal(app.rows.length, 0);
});

test("admin login is rate limited", async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await app.request("/api/admin/login", { method: "POST", body: JSON.stringify({ ...credentials, password: "wrong" }) })).status, 401);
  assert.equal((await app.request("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) })).status, 429);
});

test("sessions expire, logout requires CSRF, and logout invalidates the cookie", async (t) => {
  const app = await fixture(t);
  const { cookie, session } = await app.login();
  assert.equal((await app.request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie } })).status, 403);
  assert.equal((await app.request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": session.csrf } })).status, 200);
  assert.equal((await app.request("/api/admin/messages", { headers: { Cookie: cookie } })).status, 401);
  const second = await app.login();
  app.advance(8 * 60 * 60 * 1000 + 1);
  assert.equal((await app.request("/api/admin/messages", { headers: { Cookie: second.cookie } })).status, 401);
});

test("there are no public read, edit or delete endpoints for contact messages", async (t) => {
  const app = await fixture(t);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) assert.equal((await app.request("/api/contact-messages", { method })).status, 404);
});

test("trusted proxy users have independent rate limits", async (t) => {
  const app = await fixture(t, { trustedProxies: ["127.0.0.1"] });
  const submit = (ip) => app.request("/api/contact-messages", { method: "POST", headers: { "X-Forwarded-For": ip }, body: JSON.stringify(message()) });
  for (let i = 0; i < 10; i++) assert.equal((await submit("198.51.100.1")).status, 201);
  assert.equal((await submit("198.51.100.1")).status, 429);
  assert.equal((await submit("198.51.100.2")).status, 201);
});

test("untrusted clients cannot bypass limits by spoofing forwarded headers", async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await app.request("/api/contact-messages", { method: "POST", headers: { "X-Forwarded-For": `198.51.100.${i + 1}` }, body: JSON.stringify(message()) })).status, 201);
  assert.equal((await app.request("/api/contact-messages", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.99" }, body: JSON.stringify(message()) })).status, 429);
});


test("successful admin logins do not consume the failed-attempt allowance", async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 7; i++) await app.login();
  for (let i = 0; i < 5; i++) assert.equal((await app.request("/api/admin/login", { method: "POST", body: JSON.stringify({ ...credentials, password: "wrong" }) })).status, 401);
  assert.equal((await app.request("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) })).status, 429);
});

test("footer revision conflicts and history are protected by admin authentication", async (t) => {
  const app = await fixture(t);
  assert.equal((await app.request("/api/admin/footer/history")).status, 401);
  const { cookie, session } = await app.login();
  const headers = { Cookie: cookie, "X-CSRF-Token": session.csrf };
  const initial = await (await app.request("/api/admin/footer", { headers })).json();
  const body = JSON.stringify({ ...initial, settings: { ...initial.settings, email: "changed@example.invalid" } });
  assert.equal((await app.request("/api/admin/footer", { method: "PUT", headers, body })).status, 200);
  assert.equal((await app.request("/api/admin/footer", { method: "PUT", headers, body })).status, 409);
  const history = await (await app.request("/api/admin/footer/history", { headers })).json();
  assert.equal(history.versions.length, 2);
  assert.equal(history.versions[0].settings.email, "changed@example.invalid");
});

test("the public footer uses its confirmed server snapshot during a database outage", async (t) => {
  const app = await fixture(t);
  const initial = await (await app.request("/api/footer")).json();
  app.database.fail = true;
  const offline = await app.request("/api/footer");
  assert.equal(offline.status, 200);
  assert.deepEqual(await offline.json(), initial);
});


test("unknown-username failures on a shared IP do not lock the actual admin", async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await app.request("/api/admin/login", { method: "POST", body: JSON.stringify({ username: "unknown", password: "wrong" }) })).status, 401);
  await app.login();
});
