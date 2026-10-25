import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { publicDataPlugin } from "../build/public-data.js";
import { selectPublicData } from "../src/api/public-fields.js";
import { validateMessage, createApi } from "../server/api.js";
import { hashPassword } from "../server/config.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

test("private legacy fields are removed BEFORE JSON enters the public bundle", () => {
  const source = { company: { name: "Public" }, contactMessages: [{ text: "PRIVATE_SENTINEL" }], salesInquiries: [{ email: "secret@example.invalid" }], internal: "PRIVATE_SENTINEL" };
  const transformed = publicDataPlugin().transform(JSON.stringify(source), resolve("db.json"));
  assert.deepEqual(JSON.parse(transformed.code), selectPublicData(source));
  assert.ok(!transformed.code.includes("PRIVATE_SENTINEL"));
  assert.ok(!transformed.code.includes("secret@example.invalid"));
});

test("request identifiers must be strings, not array/object coercions", () => {
  const body = { fullName: "Test", emailAddress: "test@example.invalid", message: "Test" };
  for (const requestId of [[randomUUID()], {}, 12, null]) assert.throws(() => validateMessage({ ...body, requestId }), { status: 422 });
});

test("a session and login limit are shared by independent API workers", async (t) => {
  const database = createMemoryDatabase();
  const config = { adminUsername: "owner", adminPasswordHash: hashPassword("test-only-password") };
  const servers = [];
  async function worker() {
    const api = createApi({ database, config });
    const server = createServer((req, res) => { void api(req, res, new URL(req.url, "http://localhost")); });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}/api/`;
  }
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise((done) => server.close(done)); } });
  const first = await worker();
  const login = await fetch(first + "admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "test-only-password" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const second = await worker();
  assert.equal((await fetch(second + "admin/session", { headers: { Cookie: cookie } })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await fetch(second + "admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "wrong" }) })).status, 401);
  assert.equal((await fetch(first + "admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "owner", password: "wrong" }) })).status, 429);
});

test("new messages do not shift an existing pagination snapshot", async () => {
  const database = createMemoryDatabase();
  for (let i = 0; i < 25; i++) await database.addMessage({ requestId: randomUUID(), message: String(i) });
  const first = await database.listMessages(1, 20);
  await database.addMessage({ requestId: randomUUID(), message: "New arrival" });
  const second = await database.listMessages(2, 20, first.snapshot);
  assert.equal(second.total, 25);
  assert.equal(new Set([...first.messages, ...second.messages].map((row) => row.id)).size, 25);
});
