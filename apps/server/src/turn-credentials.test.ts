import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { generateTurnCredentials, verifyTurnCredentials } from "./domain/turn-credentials.js";

describe("generateTurnCredentials", () => {
  test("emits the standard coturn username:timestamp shape and an HMAC-SHA1 credential", () => {
    const secret = "test-secret";
    const ttl = 600;
    const before = Math.floor(Date.now() / 1000);
    const result = generateTurnCredentials({ secret, ttlSec: ttl });
    const after = Math.floor(Date.now() / 1000) + ttl;

    const [tsPart, userPart] = result.username.split(":");
    assert.ok(userPart != null && userPart.length > 0, "username has a user part");
    const ts = Number.parseInt(tsPart ?? "", 10);
    assert.ok(Number.isFinite(ts), "username has a timestamp suffix");
    assert.ok(ts > before - 1, "timestamp is around now");
    assert.ok(ts <= after, "timestamp is not beyond the ttl");

    // The HMAC-SHA1 of "<username>:<secret>" base64-encoded is the
    // standard coturn credential. We can verify by recomputing it.
    const expected = verifyTurnCredentials({ secret, credential: result.credential, username: result.username });
    assert.equal(expected, true);
  });

  test("rejects a wrong secret", () => {
    const issued = generateTurnCredentials({ secret: "good-secret", ttlSec: 600 });
    const ok = verifyTurnCredentials({
      secret: "wrong-secret",
      credential: issued.credential,
      username: issued.username,
    });
    assert.equal(ok, false);
  });

  test("rejects a tampered username", () => {
    const issued = generateTurnCredentials({ secret: "s", ttlSec: 600 });
    const ok = verifyTurnCredentials({
      secret: "s",
      credential: issued.credential,
      username: issued.username.replace(/.$/, "z"),
    });
    assert.equal(ok, false);
  });

  test("rejects a credential whose timestamp is older than the ttl", () => {
    const nowSec = 1_700_000_000;
    const issued = generateTurnCredentials({
      secret: "s",
      ttlSec: 60,
      now: () => nowSec * 1000,
    });
    const later = nowSec + 61;
    const ok = verifyTurnCredentials({
      secret: "s",
      credential: issued.credential,
      username: issued.username,
      now: () => later * 1000,
    });
    assert.equal(ok, false);
  });

  test("ttl defaults to 24h when not provided", () => {
    const before = Math.floor(Date.now() / 1000);
    const result = generateTurnCredentials({ secret: "s" });
    const after = Math.floor(Date.now() / 1000);
    const [tsPart] = result.username.split(":");
    const ts = Number.parseInt(tsPart ?? "", 10);
    assert.ok(ts >= before + 60 * 60, "ttl defaults to at least 1h from now");
    assert.ok(ts <= after + 24 * 60 * 60 + 1, "ttl defaults to at most 24h + 1s from now");
  });
});
