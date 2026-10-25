import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("an external cancellation signal keeps the request timeout active", async (t) => {
  const source = (await readFile(new URL("../src/api/contact.js", import.meta.url), "utf8")).replace("import.meta.env.BASE_URL", '"/BahaTurk/"');
  const { contactRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const external = new AbortController();
  const deadline = new AbortController();
  t.mock.method(AbortSignal, "timeout", (milliseconds) => { assert.equal(milliseconds, 15000); return deadline.signal; });
  let receivedSignal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    receivedSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  });
  const pending = contactRequest("/admin/messages", { signal: external.signal });
  deadline.abort(new Error("timeout"));
  await assert.rejects(pending, /Connection failed/);
  assert.equal(external.signal.aborted, false);
  assert.equal(receivedSignal.aborted, true);
});
