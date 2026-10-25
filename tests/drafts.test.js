import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("drafts are retained per tab, recoverable in a new tab, and storage failure is reported", async (t) => {
  const values = new Map(); let session = new Map();
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const oldSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); },
  } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem(key) { return session.get(key) ?? null; }, setItem(key, value) { session.set(key, value); } } });
  t.after(() => {
    if (oldLocal) Object.defineProperty(globalThis, "localStorage", oldLocal); else delete globalThis.localStorage;
    if (oldSession) Object.defineProperty(globalThis, "sessionStorage", oldSession); else delete globalThis.sessionStorage;
  });
  const source = (await readFile(new URL("../src/api/drafts.js", import.meta.url), "utf8")).replaceAll("import.meta.env.BASE_URL", '"/BahaTurk/"');
  const encoded = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const first = await import(encoded + "#first");
  const original = { form: { fullName: "first draft" }, requestId: "kept-retry-key", submitted: false };
  assert.equal(first.keepDraft(first.contactDraftKey, original), true);
  session = new Map();
  const second = await import(encoded + "#second");
  assert.notEqual(second.contactDraftKey, first.contactDraftKey);
  assert.equal(second.readDraft(second.contactDraftKey).requestId, original.requestId);
  second.keepDraft(second.contactDraftKey, { ...original, form: { fullName: "second draft" } });
  assert.equal(first.readDraft(first.contactDraftKey).form.fullName, "first draft");
  assert.equal(values.size, 2);
  const rootSource = (await readFile(new URL("../src/api/drafts.js", import.meta.url), "utf8")).replaceAll("import.meta.env.BASE_URL", '"/"');
  const migrated = await import(`data:text/javascript;base64,${Buffer.from(rootSource).toString("base64")}#root`);
  assert.equal(migrated.readDraft(migrated.contactDraftKey).form.fullName, "second draft");
  assert.equal(values.size, 2); // URL migration retains both original browser records.
  globalThis.localStorage.setItem = () => { throw new Error("storage full"); };
  assert.equal(first.keepDraft(first.contactDraftKey, original), false);
  assert.equal(first.readDraft(first.contactDraftKey).requestId, original.requestId);
});
