import assert from "node:assert/strict";
import test from "node:test";

import { getPasscodeClientError } from "./home-page.js";

test("getPasscodeClientError accepts a well-formed passcode", () => {
  assert.equal(getPasscodeClientError("blueFalc"), null);
  assert.equal(getPasscodeClientError("abcd"), null);
  assert.equal(getPasscodeClientError("a".repeat(64)), null);
});

test("getPasscodeClientError rejects empty input with a required message", () => {
  const error = getPasscodeClientError("");
  assert.ok(error != null);
  assert.ok(/required/i.test(error));
});

test("getPasscodeClientError rejects input with outer whitespace", () => {
  assert.ok(getPasscodeClientError(" leading")?.includes("whitespace"));
  assert.ok(getPasscodeClientError("trailing ")?.includes("whitespace"));
});

test("getPasscodeClientError rejects input with control characters", () => {
  assert.ok(getPasscodeClientError("abc\u0001def")?.includes("control"));
});

test("getPasscodeClientError rejects input outside the length bounds", () => {
  assert.ok(getPasscodeClientError("abc")?.includes("4 to 64"));
  assert.ok(getPasscodeClientError("a".repeat(65))?.includes("4 to 64"));
});

test("getPasscodeClientError never echoes the submitted value", () => {
  const secret = "sensitive-rejected-value";
  const error = getPasscodeClientError(` ${secret} `);
  assert.ok(error != null);
  assert.equal(error.includes(secret), false);
});
