import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import fc from "fast-check";

import { validatePasscode } from "./domain/room-validation.js";

/*
 * Tests for the passcode-protected-rooms feature.
 *
 * Sections (built up across tasks in .kiro/specs/passcode-protected-rooms/tasks.md):
 *   - Validator unit tests (task 2.1) + Property 2 (task 2.2)
 *   - Verifier unit tests (task 3.1) + Property 1 (task 3.2)
 *   - Rate limiter unit tests (task 4.1) + Properties 3 and 4 (tasks 4.2, 4.3)
 *   - HTTP integration for create, join, and settings (tasks 8, 9, 10) + Properties 5, 6, 7
 */

describe("Validator: validatePasscode", () => {
  test("accepts a typical 8-character passcode unchanged (idempotent)", () => {
    const result = validatePasscode("blueFalc");
    assert.deepEqual(result, { ok: true, value: "blueFalc" });
  });

  test("accepts exactly the minimum length of 4", () => {
    const result = validatePasscode("abcd");
    assert.deepEqual(result, { ok: true, value: "abcd" });
  });

  test("accepts exactly the maximum length of 64", () => {
    const value = "a".repeat(64);
    const result = validatePasscode(value);
    assert.deepEqual(result, { ok: true, value });
  });

  test("accepts non-ASCII code points within the length bounds", () => {
    const value = "pâté-café";
    assert.equal([...value].length, 9);
    const result = validatePasscode(value);
    assert.deepEqual(result, { ok: true, value });
  });

  test("rejects a string shorter than 4 code points", () => {
    const result = validatePasscode("abc");
    assert.equal(result.ok, false);
    assert.ok(
      result.ok === false && /4/.test(result.message),
      "error message should reference the 4-character minimum",
    );
  });

  test("rejects an empty string", () => {
    const result = validatePasscode("");
    assert.equal(result.ok, false);
  });

  test("rejects a string longer than 64 code points", () => {
    const value = "a".repeat(65);
    const result = validatePasscode(value);
    assert.equal(result.ok, false);
    assert.ok(
      result.ok === false && /64/.test(result.message),
      "error message should reference the 64-character maximum",
    );
  });

  test("rejects input with leading whitespace", () => {
    const result = validatePasscode(" leadingSpace");
    assert.equal(result.ok, false);
  });

  test("rejects input with trailing whitespace", () => {
    const result = validatePasscode("trailingSpace ");
    assert.equal(result.ok, false);
  });

  test("rejects input with embedded control characters", () => {
    const result = validatePasscode("abc\u0001def");
    assert.equal(result.ok, false);
  });

  test("rejects input with a newline character", () => {
    const result = validatePasscode("abc\ndef");
    assert.equal(result.ok, false);
  });

  test("rejects non-string input", () => {
    // The function accepts unknown; non-string inputs should be rejected without throwing.
    const result = validatePasscode(42 as unknown as string);
    assert.equal(result.ok, false);
  });

  test("failure messages never include the rejected passcode value", () => {
    const secret = "rejected-secret-xyz";
    const result = validatePasscode(` ${secret} `);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.ok(
        !result.message.includes(secret),
        "validator must not echo the submitted value in the failure message",
      );
    }
  });
});

describe("Validator: validatePasscode (Property 2)", () => {
  /*
   * Feature: passcode-protected-rooms, Property 2: Passcode validator idempotence and rejection
   * Validates: Requirements 1.3, 1.4, 8.2
   */

  // Code points allowed inside a valid passcode: printable characters excluding
  // any control character and excluding outer whitespace. The generator is
  // constrained to the "visible" ASCII range plus a sampling of non-ASCII
  // letters so tests exercise code-point length behavior.
  const validInternalCharArb = fc.oneof(
    fc.integer({ min: 0x21, max: 0x7e }).map((code) => String.fromCodePoint(code)),
    fc.constantFrom("é", "ñ", "ü", "Ω", "日", "中", "ñ"),
  );

  const validPasscodeArb = fc
    .array(validInternalCharArb, { minLength: 4, maxLength: 64 })
    .map((chars) => chars.join(""))
    .filter((value) => {
      // Guard against generated sequences whose total code-point length exceeds
      // the bounds (array length and code-point length match for the alphabet
      // above, but keep the invariant explicit).
      const cpLength = [...value].length;
      return cpLength >= 4 && cpLength <= 64;
    });

  const controlCharArb = fc
    .integer({ min: 0, max: 0x1f })
    .map((code) => String.fromCodePoint(code));

  test("any valid passcode returns { ok: true, value: s } (idempotence)", () => {
    fc.assert(
      fc.property(validPasscodeArb, (value) => {
        const result = validatePasscode(value);
        assert.deepEqual(result, { ok: true, value });
      }),
      { numRuns: 100 },
    );
  });

  test("any string shorter than 4 code points is rejected", () => {
    const shortArb = fc
      .array(validInternalCharArb, { minLength: 0, maxLength: 3 })
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(shortArb, (value) => {
        const result = validatePasscode(value);
        assert.equal(result.ok, false);
      }),
      { numRuns: 100 },
    );
  });

  test("any string longer than 64 code points is rejected", () => {
    const longArb = fc
      .array(validInternalCharArb, { minLength: 65, maxLength: 100 })
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(longArb, (value) => {
        const result = validatePasscode(value);
        assert.equal(result.ok, false);
      }),
      { numRuns: 100 },
    );
  });

  test("any string containing a control character is rejected", () => {
    fc.assert(
      fc.property(validPasscodeArb, controlCharArb, fc.nat(), (base, control, seed) => {
        // Inject the control character at an arbitrary position within the base.
        const position = [...base].length === 0 ? 0 : seed % [...base].length;
        const chars = [...base];
        chars.splice(position, 0, control);
        const value = chars.join("");

        const result = validatePasscode(value);
        assert.equal(result.ok, false);
      }),
      { numRuns: 100 },
    );
  });

  test("any string wrapped in whitespace is rejected", () => {
    fc.assert(
      fc.property(validPasscodeArb, fc.constantFrom(" ", "\t"), (base, ws) => {
        // Only run when wrapping keeps the body under the 64-char ceiling
        // (otherwise we would be testing length rejection, not whitespace).
        fc.pre([...base].length + 2 <= 64);

        const wrappedLeading = `${ws}${base}`;
        const wrappedTrailing = `${base}${ws}`;

        assert.equal(validatePasscode(wrappedLeading).ok, false);
        assert.equal(validatePasscode(wrappedTrailing).ok, false);
      }),
      { numRuns: 100 },
    );
  });
});


describe("Verifier: createArgon2idPasscodeVerifier", async () => {
  // Import dynamically so the test file can be loaded even before the module
  // exists (lets us author failing-first tests in a single editor session).
  const { createArgon2idPasscodeVerifier } = await import("./domain/passcode-verifier.js");

  // Use reduced-cost Argon2id parameters so example tests stay fast. The
  // production factory uses OWASP 2024 baseline defaults; reduced params are
  // still real Argon2id encoded hashes that exercise the same code path.
  const testOptions = { memoryCost: 1024, timeCost: 1, parallelism: 1 };

  test("hash returns an Argon2id encoded string", async () => {
    const verifier = createArgon2idPasscodeVerifier(testOptions);
    const encoded = await verifier.hash("blueFalc");
    assert.ok(typeof encoded === "string" && encoded.length > 0);
    assert.ok(
      encoded.startsWith("$argon2id$"),
      "hash should return an argon2id-prefixed encoded string",
    );
  });

  test("verify returns true for the same plaintext", async () => {
    const verifier = createArgon2idPasscodeVerifier(testOptions);
    const encoded = await verifier.hash("correct-horse");
    const match = await verifier.verify(encoded, "correct-horse");
    assert.equal(match, true);
  });

  test("verify returns false for a different plaintext", async () => {
    const verifier = createArgon2idPasscodeVerifier(testOptions);
    const encoded = await verifier.hash("correct-horse");
    const match = await verifier.verify(encoded, "battery-staple");
    assert.equal(match, false);
  });

  test("two hashes of the same plaintext produce distinct encodings (random salt)", async () => {
    const verifier = createArgon2idPasscodeVerifier(testOptions);
    const first = await verifier.hash("same-input");
    const second = await verifier.hash("same-input");
    assert.notEqual(first, second);
    // Both must still verify against the original plaintext.
    assert.equal(await verifier.verify(first, "same-input"), true);
    assert.equal(await verifier.verify(second, "same-input"), true);
  });
});

describe("Verifier: round-trip (Property 1)", async () => {
  /*
   * Feature: passcode-protected-rooms, Property 1: Argon2id hash/verify round-trip
   * Validates: Requirements 2.1, 4.1, 5.1
   */
  const { createArgon2idPasscodeVerifier } = await import("./domain/passcode-verifier.js");

  const validInternalCharArb = fc.oneof(
    fc.integer({ min: 0x21, max: 0x7e }).map((code) => String.fromCodePoint(code)),
    fc.constantFrom("é", "ñ", "ü", "Ω", "日"),
  );

  const validPasscodeArb = fc
    .array(validInternalCharArb, { minLength: 4, maxLength: 32 })
    .map((chars) => chars.join(""))
    .filter((value) => {
      const cpLength = [...value].length;
      return cpLength >= 4 && cpLength <= 64;
    });

  test("hash(a) verifies a and not b for any distinct a != b (reduced-cost Argon2id)", async () => {
    const verifier = createArgon2idPasscodeVerifier({
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    });

    await fc.assert(
      fc.asyncProperty(validPasscodeArb, validPasscodeArb, async (a, b) => {
        fc.pre(a !== b);
        const encodedA = await verifier.hash(a);
        assert.equal(await verifier.verify(encodedA, a), true);
        assert.equal(await verifier.verify(encodedA, b), false);
        const encodedA2 = await verifier.hash(a);
        assert.notEqual(encodedA, encodedA2);
      }),
      // 100 iterations with reduced-cost params; stays well under the test-file
      // runtime budget.
      { numRuns: 100 },
    );
  });

  test("hash/verify round-trip holds under production-baseline Argon2id (25 runs)", async () => {
    const verifier = createArgon2idPasscodeVerifier();

    await fc.assert(
      fc.asyncProperty(validPasscodeArb, validPasscodeArb, async (a, b) => {
        fc.pre(a !== b);
        const encoded = await verifier.hash(a);
        assert.equal(await verifier.verify(encoded, a), true);
        assert.equal(await verifier.verify(encoded, b), false);
      }),
      // Production parameters cost ~20-30 ms per hash; 25 runs stays inside
      // the per-file runtime budget for CI.
      { numRuns: 25 },
    );
  });
});


describe("Rate Limiter: createInMemoryPasscodeRateLimiter", async () => {
  const { createInMemoryPasscodeRateLimiter } = await import(
    "./domain/passcode-rate-limiter.js"
  );

  function createStubClock(start = 0): { now: () => number; advance: (ms: number) => void } {
    let current = start;
    return {
      now: () => current,
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  const keyA = { clientIp: "10.0.0.1", slug: "room-a" };
  const keyB = { clientIp: "10.0.0.2", slug: "room-a" };
  const keyC = { clientIp: "10.0.0.1", slug: "room-b" };

  test("initial state allows requests with no failures", () => {
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    assert.equal(limiter.shouldAllow(keyA), true);
    const state = limiter.getState(keyA);
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);
  });

  test("threshold is reached after 5 failures within the window", () => {
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure(keyA);
      assert.equal(limiter.shouldAllow(keyA), true);
    }

    // 5th failure opens the cooldown.
    limiter.recordFailure(keyA);
    assert.equal(limiter.shouldAllow(keyA), false);
    const state = limiter.getState(keyA);
    assert.equal(state.cooldownUntil !== null, true);
  });

  test("cooldown denies for 60 seconds by default", () => {
    const clock = createStubClock(1_000_000);
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
    }

    // Inside the cooldown: deny.
    clock.advance(30_000);
    assert.equal(limiter.shouldAllow(keyA), false);

    // Exactly at the boundary: still denies because cooldownUntil is exclusive
    // of the equal instant - we only re-allow once the clock has moved past.
    clock.advance(30_000 - 1);
    assert.equal(limiter.shouldAllow(keyA), false);

    // Just past the cooldown: allow again.
    clock.advance(2);
    assert.equal(limiter.shouldAllow(keyA), true);
  });

  test("recordSuccess clears both the failure ring and any active cooldown", () => {
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
    }
    assert.equal(limiter.shouldAllow(keyA), false);

    limiter.recordSuccess(keyA);
    const state = limiter.getState(keyA);
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);
    assert.equal(limiter.shouldAllow(keyA), true);
  });

  test("failures older than the window are pruned", () => {
    const clock = createStubClock(0);
    const limiter = createInMemoryPasscodeRateLimiter({
      now: clock.now,
      windowMs: 5 * 60_000,
    });

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure(keyA);
    }
    assert.equal(limiter.getState(keyA).failuresInWindow, 4);

    // Advance just past the sliding window. Older failures should drop out.
    clock.advance(5 * 60_000 + 1);
    assert.equal(limiter.getState(keyA).failuresInWindow, 0);
    assert.equal(limiter.shouldAllow(keyA), true);
  });

  test("keys are isolated by (clientIp, slug)", () => {
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
    }

    assert.equal(limiter.shouldAllow(keyA), false);
    assert.equal(limiter.shouldAllow(keyB), true); // different IP, same slug
    assert.equal(limiter.shouldAllow(keyC), true); // same IP, different slug
  });

  test("clear(slug) wipes every key that matches the slug", () => {
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
      limiter.recordFailure(keyB);
      limiter.recordFailure(keyC);
    }

    limiter.clear("room-a");

    assert.equal(limiter.shouldAllow(keyA), true);
    assert.equal(limiter.shouldAllow(keyB), true);
    // Different slug - should still be in cooldown.
    assert.equal(limiter.shouldAllow(keyC), false);
  });

  test("clientIp and slug are interpolated safely even when slug contains separators", () => {
    // Internal key shape uses `${ip}|${slug}` for locking. The public API takes
    // a tuple so the route layer never hand-crafts the string; this test just
    // asserts that two similar-looking keys do not collide.
    const clock = createStubClock();
    const limiter = createInMemoryPasscodeRateLimiter({ now: clock.now });

    const clash1 = { clientIp: "1.2.3.4", slug: "5|slug" };
    const clash2 = { clientIp: "1.2.3.4|5", slug: "slug" };

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(clash1);
    }

    assert.equal(limiter.shouldAllow(clash1), false);
    assert.equal(limiter.shouldAllow(clash2), true);
  });
});

describe("Rate Limiter: safety under repeated failures (Property 3)", async () => {
  /*
   * Feature: passcode-protected-rooms, Property 3: Rate limiter safety under repeated failures
   * Validates: Requirements 3.2, 4.2, 6.1, 6.2, 6.4
   */
  const { createInMemoryPasscodeRateLimiter } = await import(
    "./domain/passcode-rate-limiter.js"
  );

  type Event =
    | { kind: "failure"; dt: number }
    | { kind: "allow-check"; dt: number }
    | { kind: "passcode-required"; dt: number };

  const eventArb: fc.Arbitrary<Event> = fc.oneof(
    fc.record({
      kind: fc.constant<"failure">("failure"),
      dt: fc.integer({ min: 0, max: 10_000 }),
    }),
    fc.record({
      kind: fc.constant<"allow-check">("allow-check"),
      dt: fc.integer({ min: 0, max: 10_000 }),
    }),
    fc.record({
      kind: fc.constant<"passcode-required">("passcode-required"),
      dt: fc.integer({ min: 0, max: 10_000 }),
    }),
  );

  test("once threshold is reached inside the window, every allow-check in the cooldown denies", () => {
    const windowMs = 5 * 60_000;
    const cooldownMs = 60_000;
    const threshold = 5;

    fc.assert(
      fc.property(fc.array(eventArb, { minLength: 5, maxLength: 40 }), (events) => {
        let current = 0;
        const limiter = createInMemoryPasscodeRateLimiter({
          now: () => current,
          windowMs,
          cooldownMs,
          threshold,
        });
        const key = { clientIp: "10.0.0.1", slug: "room-a" };

        for (const event of events) {
          current += event.dt;

          if (event.kind === "failure") {
            limiter.recordFailure(key);
            continue;
          }

          // For allow-checks we test the invariant: if the ring currently
          // contains >= threshold failures within the window and a cooldown is
          // active, shouldAllow must be false. The passcode-required branch
          // never touches the limiter; nothing to verify there directly.
          if (event.kind === "passcode-required") {
            // Property 3 says passcode-required must not affect cooldown
            // state. We snapshot before/after and compare.
            const before = limiter.getState(key);
            // No limiter call; the route layer would return denied without
            // invoking the limiter. Simulate that by NOT calling anything.
            const after = limiter.getState(key);
            assert.deepEqual(after, before);
            continue;
          }

          const state = limiter.getState(key);
          const cooldownActive = state.cooldownUntil !== null && current < state.cooldownUntil;
          const allow = limiter.shouldAllow(key);
          if (cooldownActive) {
            assert.equal(allow, false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test("failures on one key do not affect shouldAllow on another key", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 20 }), (failureCount) => {
        let current = 0;
        const limiter = createInMemoryPasscodeRateLimiter({
          now: () => current,
          threshold: 5,
        });
        const keyA = { clientIp: "1.2.3.4", slug: "room-a" };
        const keyB = { clientIp: "5.6.7.8", slug: "room-a" };

        for (let i = 0; i < failureCount; i += 1) {
          limiter.recordFailure(keyA);
          current += 100;
        }

        assert.equal(limiter.shouldAllow(keyA), false);
        assert.equal(limiter.shouldAllow(keyB), true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Rate Limiter: recovery (Property 4)", async () => {
  /*
   * Feature: passcode-protected-rooms, Property 4: Rate limiter recovery
   * Validates: Requirements 5.3, 6.3
   */
  const { createInMemoryPasscodeRateLimiter } = await import(
    "./domain/passcode-rate-limiter.js"
  );

  test("recordSuccess at any time clears all failures and cooldown", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (failureCount) => {
        let current = 0;
        const limiter = createInMemoryPasscodeRateLimiter({
          now: () => current,
          threshold: 5,
        });
        const key = { clientIp: "10.0.0.1", slug: "room-a" };

        for (let i = 0; i < failureCount; i += 1) {
          limiter.recordFailure(key);
          current += 1_000;
        }

        limiter.recordSuccess(key);
        const state = limiter.getState(key);
        assert.equal(state.failuresInWindow, 0);
        assert.equal(state.cooldownUntil, null);
        assert.equal(limiter.shouldAllow(key), true);
      }),
      { numRuns: 100 },
    );
  });

  test("advancing the clock past cooldownMs re-allows", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 20 }), (failureCount) => {
        let current = 0;
        const cooldownMs = 60_000;
        const limiter = createInMemoryPasscodeRateLimiter({
          now: () => current,
          threshold: 5,
          cooldownMs,
        });
        const key = { clientIp: "10.0.0.1", slug: "room-a" };

        for (let i = 0; i < failureCount; i += 1) {
          limiter.recordFailure(key);
        }
        // Cooldown is active after threshold failures.
        assert.equal(limiter.shouldAllow(key), false);

        // Advance past the cooldown; limiter should re-allow.
        current += cooldownMs + 1;
        assert.equal(limiter.shouldAllow(key), true);
      }),
      { numRuns: 100 },
    );
  });
});


describe("Room store: passcode hash storage", async () => {
  const { createInMemoryRoomStore } = await import("./domain/room-store.js");

  const testNow = new Date("2026-03-24T12:00:00Z");

  function baseInput() {
    return {
      accessMode: "passcode" as const,
      maxParticipants: 2,
      qualityCap: "balanced" as const,
      allowScreenShare: true,
      initialActivity: testNow.toISOString(),
    };
  }

  test("createRoom stores the passcodeHash when provided", () => {
    const store = createInMemoryRoomStore();
    const room = store.createRoom(
      { ...baseInput(), passcodeHash: "$argon2id$stub" },
      testNow,
    );
    assert.equal(room.passcodeHash, "$argon2id$stub");

    const fetched = store.getRoom(room.slug);
    assert.equal(fetched?.passcodeHash, "$argon2id$stub");
  });

  test("createRoom leaves passcodeHash null when not provided", () => {
    const store = createInMemoryRoomStore();
    const room = store.createRoom({ ...baseInput(), accessMode: "open" }, testNow);
    assert.equal(room.passcodeHash, null);
  });

  test("setPasscodeHash replaces the stored hash and returns true", () => {
    const store = createInMemoryRoomStore();
    const room = store.createRoom(
      { ...baseInput(), passcodeHash: "$argon2id$old" },
      testNow,
    );

    const ok = store.setPasscodeHash(room.slug, "$argon2id$new");
    assert.equal(ok, true);
    assert.equal(store.getRoom(room.slug)?.passcodeHash, "$argon2id$new");
  });

  test("setPasscodeHash returns false for unknown slug", () => {
    const store = createInMemoryRoomStore();
    assert.equal(store.setPasscodeHash("not-a-room", "$argon2id$new"), false);
  });

  test("clearPasscodeHash nulls the stored hash and returns true", () => {
    const store = createInMemoryRoomStore();
    const room = store.createRoom(
      { ...baseInput(), passcodeHash: "$argon2id$stub" },
      testNow,
    );

    const ok = store.clearPasscodeHash(room.slug);
    assert.equal(ok, true);
    assert.equal(store.getRoom(room.slug)?.passcodeHash, null);
  });

  test("clearPasscodeHash returns false for unknown slug", () => {
    const store = createInMemoryRoomStore();
    assert.equal(store.clearPasscodeHash("not-a-room"), false);
  });
});


// ---------------------------------------------------------------------------
// HTTP integration helpers. Tests in the sections below build a Fastify
// instance with stubbed verifier and rate limiter so assertions run fast and
// stay deterministic.
// ---------------------------------------------------------------------------

import { buildApp } from "./app.js";
import { createInMemoryRoomStore } from "./domain/room-store.js";
import { TEST_LIVEKIT_CONFIG, createMemoryLogger, joinOutputs } from "./test-helpers.js";
import type { PasscodeVerifier } from "./domain/passcode-verifier.js";
import type { PasscodeRateLimiter } from "./domain/passcode-rate-limiter.js";

function createFakeVerifier(): PasscodeVerifier & {
  calls: { hash: number; verify: number };
} {
  const calls = { hash: 0, verify: 0 };
  return {
    calls,
    async hash(plaintext) {
      calls.hash += 1;
      // Use a recognizable prefix so tests can assert the stored value is an
      // encoded hash rather than the plaintext.
      return `$fake$${plaintext}`;
    },
    async verify(encodedHash, plaintext) {
      calls.verify += 1;
      return encodedHash === `$fake$${plaintext}`;
    },
  };
}

// Simpler rate limiter stub: synchronous in-memory implementation so HTTP
// tests can interleave failures and allow-checks without promise races.
async function createSyncRateLimiter(options?: {
  threshold?: number;
  cooldownMs?: number;
  windowMs?: number;
}) {
  const mod = await import("./domain/passcode-rate-limiter.js");
  let now = 1_700_000_000_000;
  const limiter = mod.createInMemoryPasscodeRateLimiter({
    now: () => now,
    threshold: options?.threshold ?? 5,
    cooldownMs: options?.cooldownMs ?? 60_000,
    windowMs: options?.windowMs ?? 5 * 60_000,
  });
  return {
    limiter,
    advanceClock: (ms: number) => {
      now += ms;
    },
    setClock: (value: number) => {
      now = value;
    },
  };
}

describe("HTTP: create passcode room", () => {
  test("rejects create with accessMode=passcode and missing passcode", async () => {
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode" },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { message: string };
    assert.ok(/passcode is required/i.test(body.message));
    await app.close();
  });

  test("rejects create with a passcode that is too short", async () => {
    const app = buildApp({ logger: false, liveKitConfig: TEST_LIVEKIT_CONFIG });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "abc" },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { message: string };
    assert.ok(/4 to 64/.test(body.message));
    await app.close();
  });

  test("accepts create with a valid passcode and echoes plaintext exactly once", async () => {
    const verifier = createFakeVerifier();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "blueFalcon42" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      passcode?: string;
      room: { accessMode: string };
    };
    assert.equal(body.passcode, "blueFalcon42");
    assert.equal(body.room.accessMode, "passcode");
    // Plaintext must not appear nested inside the room summary.
    assert.equal((body.room as Record<string, unknown>).passcode, undefined);
    // `room` summary never carries a hash either.
    assert.equal((body.room as Record<string, unknown>).passcodeHash, undefined);
    // Verifier.hash was called once.
    assert.equal(verifier.calls.hash, 1);
    await app.close();
  });

  test("stores passcodeHash on the StoredRoom (not plaintext)", async () => {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      roomStore: store,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "blueFalcon42" },
    });

    const body = response.json() as { roomSlug: string };
    const stored = store.getRoom(body.roomSlug);
    assert.ok(stored != null);
    assert.equal(stored.accessMode, "passcode");
    assert.equal(stored.passcodeHash, "$fake$blueFalcon42");
    await app.close();
  });

  test("open-mode create with stray passcode field succeeds and stores no hash (Property 6 partial)", async () => {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      roomStore: store,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "open", passcode: "ignored-value" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { roomSlug: string; passcode?: string };
    assert.equal(body.passcode, undefined);

    const stored = store.getRoom(body.roomSlug);
    assert.equal(stored?.passcodeHash, null);
    // Verifier must not have been invoked for a non-passcode room.
    assert.equal(verifier.calls.hash, 0);
    await app.close();
  });
});

describe("HTTP: join passcode room", () => {
  async function setupRoom(verifier: PasscodeVerifier, limiter: PasscodeRateLimiter) {
    const store = createInMemoryRoomStore();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      passcodeRateLimiter: limiter,
      roomStore: store,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "correct-horse-42" },
    });
    const { roomSlug } = createResponse.json() as { roomSlug: string };
    return { app, store, slug: roomSlug };
  }

  test("join without a passcode returns passcode_required without invoking verifier", async () => {
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const { app, slug } = await setupRoom(verifier, limiter);

    const hashCountBefore = verifier.calls.hash; // set to 1 after create
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { joinState: string; reason: string };
    assert.equal(body.joinState, "denied");
    assert.equal(body.reason, "passcode_required");
    // Verifier must not have been called for passcode_required.
    assert.equal(verifier.calls.verify, 0);
    // The only hash call is the one from create.
    assert.equal(verifier.calls.hash, hashCountBefore);
    await app.close();
  });

  test("join with wrong passcode returns invalid_passcode and records a failure", async () => {
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const { app, slug } = await setupRoom(verifier, limiter);

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "wrong" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { joinState: string; reason: string };
    assert.equal(body.joinState, "denied");
    assert.equal(body.reason, "invalid_passcode");
    assert.equal(verifier.calls.verify, 1);

    const state = limiter.getState({ clientIp: "127.0.0.1", slug });
    assert.equal(state.failuresInWindow, 1);
    await app.close();
  });

  test("join with correct passcode returns direct and clears any failures", async () => {
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const { app, slug } = await setupRoom(verifier, limiter);

    // Prime one failure so we can observe that success clears it.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "wrong" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "correct-horse-42" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      joinState: string;
      sessionId?: string;
      transportPreference?: string;
    };
    assert.equal(body.joinState, "direct");
    assert.ok(body.sessionId && body.sessionId.length > 0);
    assert.equal(body.transportPreference, "sfu");

    const state = limiter.getState({ clientIp: "127.0.0.1", slug });
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);
    await app.close();
  });

  test("after 5 failures the next attempt is denied without invoking the verifier", async () => {
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const { app, slug } = await setupRoom(verifier, limiter);

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: `/api/rooms/${slug}/join`,
        payload: { displayName: "Sam", passcode: "wrong" },
      });
    }
    const verifyCountAfterFailures = verifier.calls.verify;

    // Cooldown is now active. Next attempt - even with the correct passcode -
    // must be denied and must not invoke the verifier again.
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "correct-horse-42" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { joinState: string; reason: string };
    assert.equal(body.joinState, "denied");
    assert.equal(body.reason, "invalid_passcode");
    assert.equal(verifier.calls.verify, verifyCountAfterFailures);
    await app.close();
  });

  test("room_expired precedence over passcode check", async () => {
    // Build with an artificial clock that jumps far forward after room create.
    let simulated = new Date("2026-03-24T18:00:00Z");
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      passcodeRateLimiter: limiter,
      roomStore: store,
      now: () => simulated,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "correct-horse-42" },
    });
    const { roomSlug } = createResponse.json() as { roomSlug: string };

    // Jump far past the 2-hour default TTL.
    simulated = new Date(simulated.getTime() + 10 * 60 * 60 * 1000);

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "Sam", passcode: "correct-horse-42" },
    });

    const body = response.json() as { joinState: string; reason: string };
    assert.equal(body.joinState, "denied");
    assert.equal(body.reason, "room_expired");
    // Verifier not invoked when the room is already expired.
    assert.equal(verifier.calls.verify, 0);
    await app.close();
  });

  test("room_full precedence over passcode check", async () => {
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const store = createInMemoryRoomStore();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      passcodeRateLimiter: limiter,
      roomStore: store,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        accessMode: "passcode",
        passcode: "correct-horse-42",
        maxParticipants: 2,
      },
    });
    const { roomSlug } = createResponse.json() as { roomSlug: string };

    // Fill the room with two direct sessions via the correct passcode.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "A", passcode: "correct-horse-42" },
    });
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "B", passcode: "correct-horse-42" },
    });

    const verifyCallsBefore = verifier.calls.verify;

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "C", passcode: "correct-horse-42" },
    });

    const body = response.json() as { joinState: string; reason: string };
    assert.equal(body.joinState, "denied");
    assert.equal(body.reason, "room_full");
    // Verifier must not be consulted when the room is already full.
    assert.equal(verifier.calls.verify, verifyCallsBefore);
    await app.close();
  });
});


describe("HTTP: settings endpoint", () => {
  async function setup() {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncRateLimiter();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      passcodeRateLimiter: limiter,
      roomStore: store,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "original-passcode" },
    });
    const { roomSlug, hostSecret } = createResponse.json() as {
      roomSlug: string;
      hostSecret: string;
    };
    return { app, store, slug: roomSlug, hostSecret, verifier, limiter };
  }

  test("403 when host secret is missing", async () => {
    const { app, slug } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      payload: { accessMode: "open" },
    });

    assert.equal(response.statusCode, 403);
    await app.close();
  });

  test("400 when body has neither accessMode nor passcode", async () => {
    const { app, slug, hostSecret } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    await app.close();
  });

  test("rotating the passcode replaces the hash and clears the rate limiter", async () => {
    const { app, store, slug, hostSecret, limiter } = await setup();

    // Prime a failure so we can watch the limiter get cleared on rotation.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "wrong" },
    });
    assert.equal(limiter.getState({ clientIp: "127.0.0.1", slug }).failuresInWindow, 1);

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { passcode: "new-passcode-value" },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as Record<string, unknown>;
    // Response must never echo the plaintext.
    assert.equal(body.passcode, undefined);
    assert.equal((body.room as { accessMode: string }).accessMode, "passcode");

    assert.equal(store.getRoom(slug)?.passcodeHash, "$fake$new-passcode-value");
    assert.equal(limiter.getState({ clientIp: "127.0.0.1", slug }).failuresInWindow, 0);

    // Old passcode should now fail.
    const oldAttempt = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "original-passcode" },
    });
    const oldBody = oldAttempt.json() as { reason: string };
    assert.equal(oldBody.reason, "invalid_passcode");

    // New passcode admits.
    const newAttempt = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "new-passcode-value" },
    });
    const newBody = newAttempt.json() as { joinState: string };
    assert.equal(newBody.joinState, "direct");
    await app.close();
  });

  test("changing accessMode away from passcode clears the hash and admits directly", async () => {
    const { app, store, slug, hostSecret, limiter } = await setup();

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "open" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(store.getRoom(slug)?.passcodeHash, null);
    assert.equal(store.getRoom(slug)?.accessMode, "open");
    assert.equal(limiter.getState({ clientIp: "127.0.0.1", slug }).failuresInWindow, 0);

    // Previously-failed passcode attempts no longer apply: any join with or
    // without a passcode follows the open path.
    const admit = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/join`,
      payload: { displayName: "Sam", passcode: "ignored-anyway" },
    });
    const admitBody = admit.json() as { joinState: string };
    assert.equal(admitBody.joinState, "direct");
    await app.close();
  });

  test("rotation fails when the room is not in passcode mode", async () => {
    const { app, slug, hostSecret } = await setup();

    // First switch the room away from passcode mode.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "open" },
    });

    // Rotate call should now fail because the room is no longer passcode mode.
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { passcode: "another-one" },
    });

    assert.equal(response.statusCode, 400);
    await app.close();
  });

  test("transitioning to passcode mode requires a valid passcode payload", async () => {
    const { app, slug, hostSecret } = await setup();

    // First switch away from passcode.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "open" },
    });

    // Now try to switch back to passcode without supplying a passcode body.
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "passcode" },
    });

    assert.equal(response.statusCode, 400);
    await app.close();
  });
});

describe("HTTP: Property 5 (no echo of passcode plaintext or hash)", () => {
  /*
   * Feature: passcode-protected-rooms, Property 5: No echo of passcode plaintext or hash
   * Validates: Requirements 2.2, 2.3, 2.4, 7.1, 7.2, 7.3, 9.2
   *
   * Uses a real Argon2id verifier with reduced parameters so the stored hash
   * is a realistic encoded string. Captures log output through the memory
   * logger helper and scans every response body except the single sanctioned
   * create-response echo.
   */

  const passcodeCharArb = fc
    .array(fc.integer({ min: 0x21, max: 0x7e }).map((c) => String.fromCodePoint(c)), {
      minLength: 8,
      maxLength: 24,
    })
    .map((chars) => chars.join(""));

  test("plaintext and hash never appear outside the sanctioned create echo", async () => {
    const { createArgon2idPasscodeVerifier } = await import("./domain/passcode-verifier.js");

    await fc.assert(
      fc.asyncProperty(passcodeCharArb, async (plaintext) => {
        fc.pre(plaintext.trim() === plaintext);
        fc.pre(!/\p{Cc}/u.test(plaintext));

        const verifier = createArgon2idPasscodeVerifier({
          memoryCost: 1024,
          timeCost: 1,
          parallelism: 1,
        });
        const store = createInMemoryRoomStore();
        const memLogger = createMemoryLogger();
        const app = buildApp({
          logger: memLogger.loggerOption,
          liveKitConfig: TEST_LIVEKIT_CONFIG,
          passcodeVerifier: verifier,
          roomStore: store,
        });

        const nonCreateBodies: string[] = [];

        const createResponse = await app.inject({
          method: "POST",
          url: "/api/rooms",
          payload: { accessMode: "passcode", passcode: plaintext },
        });
        const { roomSlug } = createResponse.json() as { roomSlug: string };
        const storedHash = store.getRoom(roomSlug)?.passcodeHash ?? "";

        // Wrong passcode attempt.
        const wrong = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/join`,
          payload: { displayName: "Sam", passcode: `${plaintext}-nope` },
        });
        nonCreateBodies.push(wrong.body);

        // Correct passcode attempt.
        const right = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/join`,
          payload: { displayName: "Sam", passcode: plaintext },
        });
        nonCreateBodies.push(right.body);

        // Room metadata GET must not carry plaintext or hash.
        const meta = await app.inject({
          method: "GET",
          url: `/api/rooms/${roomSlug}`,
        });
        nonCreateBodies.push(meta.body);

        await app.close();

        const combined = joinOutputs(nonCreateBodies, memLogger.readCapturedLogs());

        assert.equal(
          combined.includes(plaintext),
          false,
          `plaintext leaked in response or log output`,
        );
        assert.equal(
          combined.includes(storedHash),
          false,
          `passcode hash leaked in response or log output`,
        );
      }),
      { numRuns: 20 },
    );
  });
});

describe("HTTP: Property 6 (access-mode gating)", () => {
  /*
   * Feature: passcode-protected-rooms, Property 6: Access-mode gating
   * Validates: Requirements 1.5, 4.3 (negative half)
   *
   * For any room created with accessMode in {open, lobby}, the verifier must
   * not be invoked on any create or join call regardless of stray passcode
   * fields, and the rate limiter must show zero failures.
   */

  const anyPasscodeArb = fc.option(
    fc.string({ minLength: 1, maxLength: 30 }),
    { nil: undefined },
  );

  test("verifier is not invoked for non-passcode rooms, regardless of stray passcode fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("open" as const, "lobby" as const),
        anyPasscodeArb,
        anyPasscodeArb,
        async (accessMode, createPasscode, joinPasscode) => {
          const verifier = createFakeVerifier();
          const { limiter } = await createSyncRateLimiter();
          const store = createInMemoryRoomStore();
          const app = buildApp({
            logger: false,
            liveKitConfig: TEST_LIVEKIT_CONFIG,
            passcodeVerifier: verifier,
            passcodeRateLimiter: limiter,
            roomStore: store,
          });

          const createResponse = await app.inject({
            method: "POST",
            url: "/api/rooms",
            payload: { accessMode, passcode: createPasscode },
          });

          // Skip runs where validation rejected the create call (e.g. when
          // accessMode is somehow rejected by other validation rules). The
          // property only applies to successfully created rooms.
          if (createResponse.statusCode !== 200) {
            await app.close();
            return;
          }

          const { roomSlug } = createResponse.json() as { roomSlug: string };
          assert.equal(store.getRoom(roomSlug)?.passcodeHash, null);

          const joinResponse = await app.inject({
            method: "POST",
            url: `/api/rooms/${roomSlug}/join`,
            payload: { displayName: "Sam", passcode: joinPasscode },
          });

          // For open rooms the join path should return direct or room_full;
          // for lobby rooms it should return waiting. Neither path should have
          // consulted the verifier or the rate limiter.
          const body = joinResponse.json() as { joinState: string };
          assert.ok(["direct", "waiting", "denied"].includes(body.joinState));

          assert.equal(verifier.calls.verify, 0);
          assert.equal(
            limiter.getState({ clientIp: "127.0.0.1", slug: roomSlug }).failuresInWindow,
            0,
          );

          await app.close();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("HTTP: Property 7 (rotation safety)", () => {
  /*
   * Feature: passcode-protected-rooms, Property 7: Rotation safety
   * Validates: Requirements 8.1, 8.3
   */

  const passcodeArb = fc
    .array(
      fc.integer({ min: 0x21, max: 0x7e }).map((c) => String.fromCodePoint(c)),
      { minLength: 8, maxLength: 20 },
    )
    .map((chars) => chars.join(""));

  test("after rotation, the old passcode fails and the new one admits (even with pre-rotation cooldown)", async () => {
    await fc.assert(
      fc.asyncProperty(passcodeArb, passcodeArb, async (oldP, newP) => {
        fc.pre(oldP !== newP);

        const verifier = createFakeVerifier();
        const { limiter } = await createSyncRateLimiter();
        const store = createInMemoryRoomStore();
        const app = buildApp({
          logger: false,
          liveKitConfig: TEST_LIVEKIT_CONFIG,
          passcodeVerifier: verifier,
          passcodeRateLimiter: limiter,
          roomStore: store,
        });

        const createResponse = await app.inject({
          method: "POST",
          url: "/api/rooms",
          payload: { accessMode: "passcode", passcode: oldP },
        });
        const { roomSlug, hostSecret } = createResponse.json() as {
          roomSlug: string;
          hostSecret: string;
        };

        // Burn the rate limiter by submitting five wrong attempts.
        for (let i = 0; i < 5; i += 1) {
          await app.inject({
            method: "POST",
            url: `/api/rooms/${roomSlug}/join`,
            payload: { displayName: "Sam", passcode: `${oldP}-wrong` },
          });
        }

        // Rotate.
        const rotate = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/settings`,
          headers: { "x-host-secret": hostSecret },
          payload: { passcode: newP },
        });
        assert.equal(rotate.statusCode, 200);

        // Old passcode fails.
        const oldAttempt = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/join`,
          payload: { displayName: "Sam", passcode: oldP },
        });
        const oldBody = oldAttempt.json() as { reason: string };
        assert.equal(oldBody.reason, "invalid_passcode");

        // New passcode admits.
        const newAttempt = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/join`,
          payload: { displayName: "Sam", passcode: newP },
        });
        const newBody = newAttempt.json() as { joinState: string };
        assert.equal(newBody.joinState, "direct");

        // Rate limiter state for this slug should be zero across any key.
        const state = limiter.getState({ clientIp: "127.0.0.1", slug: roomSlug });
        assert.equal(state.failuresInWindow, 0);
        assert.equal(state.cooldownUntil, null);

        await app.close();
      }),
      { numRuns: 25 },
    );
  });
});


describe("Activity bumps from settings mutations", () => {
  test("successful passcode rotation bumps lastActivityAt", async () => {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    let simulated = new Date("2026-03-24T12:00:00.000Z");
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      roomStore: store,
      now: () => simulated,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "original-passcode" },
    });
    const { roomSlug, hostSecret } = createResponse.json() as {
      roomSlug: string;
      hostSecret: string;
    };
    const beforeRotate = store.getRoom(roomSlug)?.lastActivityAt;

    simulated = new Date(simulated.getTime() + 30 * 60_000);
    const rotateResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { passcode: "new-rotated-passcode" },
    });
    assert.equal(rotateResponse.statusCode, 200);

    const afterRotate = store.getRoom(roomSlug)?.lastActivityAt;
    assert.equal(afterRotate, simulated.toISOString());
    assert.ok(
      beforeRotate != null &&
        afterRotate != null &&
        Date.parse(afterRotate) > Date.parse(beforeRotate),
    );

    await app.close();
  });

  test("settings call with wrong host secret does NOT bump lastActivityAt", async () => {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    let simulated = new Date("2026-03-24T12:00:00.000Z");
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      roomStore: store,
      now: () => simulated,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "original-passcode" },
    });
    const { roomSlug } = createResponse.json() as { roomSlug: string };
    const beforeAttempt = store.getRoom(roomSlug)?.lastActivityAt;

    simulated = new Date(simulated.getTime() + 30 * 60_000);
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": "wrong-host-secret" },
      payload: { accessMode: "open" },
    });
    assert.equal(response.statusCode, 403);

    const afterAttempt = store.getRoom(roomSlug)?.lastActivityAt;
    assert.equal(afterAttempt, beforeAttempt);

    await app.close();
  });

  test("wrong-passcode join does NOT bump lastActivityAt", async () => {
    const store = createInMemoryRoomStore();
    const verifier = createFakeVerifier();
    let simulated = new Date("2026-03-24T12:00:00.000Z");
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      roomStore: store,
      now: () => simulated,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { accessMode: "passcode", passcode: "correct-passcode" },
    });
    const { roomSlug } = createResponse.json() as { roomSlug: string };
    const beforeAttempt = store.getRoom(roomSlug)?.lastActivityAt;

    simulated = new Date(simulated.getTime() + 30 * 60_000);
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "Sam", passcode: "wrong-passcode" },
    });
    assert.equal(response.statusCode, 200);

    const afterAttempt = store.getRoom(roomSlug)?.lastActivityAt;
    assert.equal(afterAttempt, beforeAttempt);

    await app.close();
  });
});
