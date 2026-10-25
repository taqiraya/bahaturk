import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FOOTER, validateFooter, phoneHref } from "../shared/footer-settings.js";

test("footer retains original business details and rejects unsafe links or malformed values", () => {
  assert.deepEqual(validateFooter(DEFAULT_FOOTER), DEFAULT_FOOTER);
  assert.equal(phoneHref(DEFAULT_FOOTER.phone1), "tel:+93749171717");
  for (const patch of [{ facebook: "javascript:alert(1)" }, { mapUrl: "data:text/html,test" }, { email: "invalid" }, { phone1: "abc" }, { youtube: "https://user:password@example.com" }, { address: [] }, { unknown: "field" }]) {
    assert.throws(() => validateFooter({ ...DEFAULT_FOOTER, ...patch }), { status: 422 });
  }
});
