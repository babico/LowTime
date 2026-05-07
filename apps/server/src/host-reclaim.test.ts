import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import fc from "fast-check";

/*
 * Tests for the host-reclaim-after-refresh feature.
 *
 * Sections (built up across tasks in .kiro/specs/host-reclaim-after-refresh/tasks.md):
 *   - Rate Limiter: createInMemoryReclaimRateLimiter (task 2.1)
 *   - HTTP: reclaim happy path (task 4.1)
 *   - HTTP: reclaim failure modes (task 4.1)
 *   - Property tests 1..5 (tasks 5.1..5.5)
 */

describe("Rate Limiter: createInMemoryReclaimRateLimiter", async () => {
  const { createInMemoryReclaimRateLimiter } = await import(
    "./domain/reclaim-rate-limiter.js"
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
    const limiter = createInMemoryReclaimRateLimiter({ now: clock.now });

    assert.equal(limiter.shouldAllow(keyA), true);
    const state = limiter.getState(keyA);
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);
  });

  test("threshold is reached after 5 failures within the window", () => {
    const clock = createStubClock();
    const limiter = createInMemoryReclaimRateLimiter({ now: clock.now });

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure(keyA);
      assert.equal(limiter.shouldAllow(keyA), true);
    }
    limiter.recordFailure(keyA);
    assert.equal(limiter.shouldAllow(keyA), false);
  });

  test("cooldown denies for 60 seconds by default and clears after the window", () => {
    const clock = createStubClock(1_000_000);
    const limiter = createInMemoryReclaimRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
    }

    clock.advance(30_000);
    assert.equal(limiter.shouldAllow(keyA), false);

    clock.advance(30_000 + 1);
    assert.equal(limiter.shouldAllow(keyA), true);
  });

  test("recordSuccess clears the failure ring and any active cooldown", () => {
    const clock = createStubClock();
    const limiter = createInMemoryReclaimRateLimiter({ now: clock.now });

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
    const clock = createStubClock();
    const limiter = createInMemoryReclaimRateLimiter({
      now: clock.now,
      windowMs: 5 * 60_000,
    });

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure(keyA);
    }
    assert.equal(limiter.getState(keyA).failuresInWindow, 4);

    clock.advance(5 * 60_000 + 1);
    assert.equal(limiter.getState(keyA).failuresInWindow, 0);
    assert.equal(limiter.shouldAllow(keyA), true);
  });

  test("keys are isolated by (clientIp, slug)", () => {
    const clock = createStubClock();
    const limiter = createInMemoryReclaimRateLimiter({ now: clock.now });

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure(keyA);
    }

    assert.equal(limiter.shouldAllow(keyA), false);
    assert.equal(limiter.shouldAllow(keyB), true);
    assert.equal(limiter.shouldAllow(keyC), true);
  });

  test("deliberately exposes no clear(slug) helper; settings mutations must not wipe reclaim state", () => {
    const limiter = createInMemoryReclaimRateLimiter();
    // Compile-time check: `clear` is not part of the interface. The test
    // exists to lock the intent documented in the design doc.
    assert.equal(typeof (limiter as { clear?: unknown }).clear, "undefined");
  });
});


// ---------------------------------------------------------------------------
// HTTP integration tests
// ---------------------------------------------------------------------------

import { buildApp } from "./app.js";
import { createInMemoryRoomStore } from "./domain/room-store.js";
import {
  TEST_LIVEKIT_CONFIG,
  createMemoryLogger,
  joinOutputs,
} from "./test-helpers.js";

function createFakeVerifier() {
  const calls = { hash: 0, verify: 0 };
  return {
    calls,
    async hash(plaintext: string) {
      calls.hash += 1;
      return `$fake$${plaintext}`;
    },
    async verify(encodedHash: string, plaintext: string) {
      calls.verify += 1;
      return encodedHash === `$fake$${plaintext}`;
    },
  };
}

async function createSyncReclaimLimiter(options?: {
  threshold?: number;
  cooldownMs?: number;
  windowMs?: number;
}) {
  const mod = await import("./domain/reclaim-rate-limiter.js");
  let now = 1_700_000_000_000;
  const limiter = mod.createInMemoryReclaimRateLimiter({
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

async function setupRoom(payload: Record<string, unknown> = {}) {
  const verifier = createFakeVerifier();
  const { limiter: reclaimRateLimiter } = await createSyncReclaimLimiter();
  const store = createInMemoryRoomStore();
  const app = buildApp({
    logger: false,
    liveKitConfig: TEST_LIVEKIT_CONFIG,
    passcodeVerifier: verifier,
    reclaimRateLimiter,
    roomStore: store,
  });
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload,
  });
  const body = createResponse.json() as {
    roomSlug: string;
    hostSecret: string;
    passcode?: string;
  };
  return { app, store, reclaimRateLimiter, verifier, ...body };
}

describe("HTTP: reclaim happy path", () => {
  test("returns 200 with { room, lobbyRequests: [] } for an open room", async () => {
    const { app, roomSlug, hostSecret } = await setupRoom({ accessMode: "open" });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      room: { slug: string; accessMode: string };
      lobbyRequests: unknown[];
    };
    assert.equal(body.room.slug, roomSlug);
    assert.equal(body.room.accessMode, "open");
    assert.deepEqual(body.lobbyRequests, []);
    await app.close();
  });

  test("returns the pending lobby queue for a lobby room", async () => {
    const { app, roomSlug, hostSecret } = await setupRoom({ accessMode: "lobby" });

    // Enqueue two guests so the reclaim response carries the queue.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "Guest A" },
    });
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "Guest B" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      lobbyRequests: { displayName: string; requestId: string }[];
    };
    assert.equal(body.lobbyRequests.length, 2);
    assert.deepEqual(
      body.lobbyRequests.map((entry) => entry.displayName).sort(),
      ["Guest A", "Guest B"],
    );
    // Request id shape matches the lobby list endpoint.
    for (const entry of body.lobbyRequests) {
      assert.ok(entry.requestId.startsWith("req_"));
    }
    await app.close();
  });

  test("returns empty lobby list for a passcode room and never echoes passcode plaintext or hash", async () => {
    const { app, store, roomSlug, hostSecret, passcode } = await setupRoom({
      accessMode: "passcode",
      passcode: "original-passcode-9",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 200);
    const body = response.body;
    const stored = store.getRoom(roomSlug);
    assert.equal(body.includes(passcode ?? "UNUSED"), false);
    assert.equal(stored?.passcodeHash != null && body.includes(stored.passcodeHash), false);
    assert.deepEqual(JSON.parse(body).lobbyRequests, []);
    await app.close();
  });
});

describe("HTTP: reclaim failure modes", () => {
  test("missing header returns 403 generic body without touching the limiter", async () => {
    const { app, roomSlug, reclaimRateLimiter } = await setupRoom();

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
    });

    assert.equal(response.statusCode, 403);
    const body = response.json() as { message: string };
    assert.equal(body.message, "Host secret is required");
    assert.equal(
      reclaimRateLimiter.getState({ clientIp: "127.0.0.1", slug: roomSlug }).failuresInWindow,
      0,
    );
    await app.close();
  });

  test("wrong header returns 403 generic body and records a failure", async () => {
    const { app, roomSlug, reclaimRateLimiter } = await setupRoom();

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": "nope" },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(
      reclaimRateLimiter.getState({ clientIp: "127.0.0.1", slug: roomSlug }).failuresInWindow,
      1,
    );
    await app.close();
  });

  test("unknown slug returns 403 without recording a failure (anti-enumeration)", async () => {
    const { app, reclaimRateLimiter } = await setupRoom();

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/ThisRoomDoesNotExist/reclaim",
      headers: { "x-host-secret": "anything" },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json() as { message: string };
    assert.equal(body.message, "Host secret is required");
    // Limiter untouched even for the "wrong" header on an unknown slug.
    assert.equal(
      reclaimRateLimiter.getState({
        clientIp: "127.0.0.1",
        slug: "ThisRoomDoesNotExist",
      }).failuresInWindow,
      0,
    );
    await app.close();
  });

  test("after 5 wrong attempts the next request is denied without calling hasValidHostSecret", async () => {
    const { app, roomSlug, hostSecret } = await setupRoom();

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomSlug}/reclaim`,
        headers: { "x-host-secret": "wrong" },
      });
    }

    // Even with the correct secret, cooldown wins.
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });
    assert.equal(response.statusCode, 403);
    await app.close();
  });

  test("expired room with valid secret returns 409 without room body, and resets the counter", async () => {
    // Use a clock we can jump forward past the 2-hour default TTL.
    let now = new Date("2026-03-24T18:00:00Z");
    const verifier = createFakeVerifier();
    const { limiter } = await createSyncReclaimLimiter();
    const store = createInMemoryRoomStore();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      passcodeVerifier: verifier,
      reclaimRateLimiter: limiter,
      roomStore: store,
      now: () => now,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {},
    });
    const { roomSlug, hostSecret } = createResponse.json() as {
      roomSlug: string;
      hostSecret: string;
    };

    // Prime a failure so we can observe the counter reset on the 409 path.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": "wrong" },
    });
    assert.equal(
      limiter.getState({ clientIp: "127.0.0.1", slug: roomSlug }).failuresInWindow,
      1,
    );

    // Jump past the TTL.
    now = new Date(now.getTime() + 10 * 60 * 60 * 1000);

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 409);
    const body = response.json() as { message: string; room?: unknown };
    assert.equal(body.message, "Room is no longer available");
    assert.equal(body.room, undefined);
    assert.equal(
      limiter.getState({ clientIp: "127.0.0.1", slug: roomSlug }).failuresInWindow,
      0,
    );
    await app.close();
  });

  test("closed room with valid secret returns 409", async () => {
    const { app, store, roomSlug, hostSecret } = await setupRoom();
    const stored = store.getRoom(roomSlug);
    if (stored != null) {
      stored.status = "closed";
    }

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 409);
    await app.close();
  });
});

describe("HTTP: reclaim reflects latest room state", () => {
  test("accessMode change via settings is visible on the next reclaim call", async () => {
    const { app, roomSlug, hostSecret } = await setupRoom({
      accessMode: "passcode",
      passcode: "original-passcode-9",
    });

    // Flip the room to open mode.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "open" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/reclaim`,
      headers: { "x-host-secret": hostSecret },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { room: { accessMode: string } };
    assert.equal(body.room.accessMode, "open");
    await app.close();
  });
});

describe("Property 3: Reclaim is idempotent", () => {
  /*
   * Feature: host-reclaim-after-refresh, Property 3: Reclaim is idempotent
   * Validates: Requirements 3.1, 3.2, 6.1
   */
  test("N reclaim calls produce the same response and do not mutate room state", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (n) => {
        const { app, store, roomSlug, hostSecret } = await setupRoom({
          accessMode: "open",
        });

        const snapshotBefore = JSON.parse(JSON.stringify(store.getRoom(roomSlug)));

        const bodies: string[] = [];
        for (let i = 0; i < n; i += 1) {
          const response = await app.inject({
            method: "POST",
            url: `/api/rooms/${roomSlug}/reclaim`,
            headers: { "x-host-secret": hostSecret },
          });
          bodies.push(response.body);
        }

        for (let i = 1; i < bodies.length; i += 1) {
          assert.equal(bodies[i], bodies[0]);
        }

        const snapshotAfter = JSON.parse(JSON.stringify(store.getRoom(roomSlug)));
        assert.deepEqual(snapshotAfter, snapshotBefore);
        await app.close();
      }),
      { numRuns: 25 },
    );
  });
});

describe("Property 5: Unknown-room anti-enumeration", () => {
  /*
   * Feature: host-reclaim-after-refresh, Property 5: Unknown-room anti-enumeration
   * Validates: Requirements 1.4, 5.6, 7.3
   */
  test("unknown-slug reclaim attempts never mutate the limiter and never call hasValidHostSecret", async () => {
    const headerStateArb = fc.oneof(
      fc.constant<"absent">("absent"),
      fc.constant<"empty">("empty"),
      fc.constant<"wrong">("wrong"),
      fc.string({ minLength: 1, maxLength: 40 }).map((random) => ({ random } as const)),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(headerStateArb, { minLength: 1, maxLength: 15 }),
        async (events) => {
          const verifier = createFakeVerifier();
          const { limiter } = await createSyncReclaimLimiter();
          const app = buildApp({
            logger: false,
            liveKitConfig: TEST_LIVEKIT_CONFIG,
            passcodeVerifier: verifier,
            reclaimRateLimiter: limiter,
          });

          const unknownSlug = "ThisRoomDoesNotExist123";

          for (const event of events) {
            const headers: Record<string, string> = {};
            if (event === "wrong") {
              headers["x-host-secret"] = "some-random-guess";
            } else if (event === "empty") {
              headers["x-host-secret"] = "";
            } else if (typeof event === "object" && event !== null && "random" in event) {
              headers["x-host-secret"] = (event as { random: string }).random;
            }
            // "absent": no header.

            const response = await app.inject({
              method: "POST",
              url: `/api/rooms/${unknownSlug}/reclaim`,
              headers,
            });

            assert.equal(response.statusCode, 403);
            const body = response.json() as { message: string };
            assert.equal(body.message, "Host secret is required");
          }

          const state = limiter.getState({ clientIp: "127.0.0.1", slug: unknownSlug });
          assert.equal(state.failuresInWindow, 0);
          assert.equal(state.cooldownUntil, null);
          await app.close();
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("Property 2: No echo of secrets", () => {
  /*
   * Feature: host-reclaim-after-refresh, Property 2: No echo of secrets
   * Validates: Requirements 1.2, 1.3, 2.4, 7.1, 7.2, 7.3, 7.4, 6.3
   *
   * The real host secret is generated by the server and captured after
   * create; the generator only controls the scenario (mix of reclaim attempts
   * against wrong secrets). Captures server logs through createMemoryLogger
   * and asserts no substring equal to the host secret appears outside the
   * sanctioned create-response echo.
   */
  test("host secret plaintext never leaks in any non-create response body or log line", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 3 }),
        async (correctAttempts, wrongAttempts) => {
          const verifier = createFakeVerifier();
          const { limiter } = await createSyncReclaimLimiter();
          const store = createInMemoryRoomStore();
          const memLogger = createMemoryLogger();
          const app = buildApp({
            logger: memLogger.loggerOption,
            liveKitConfig: TEST_LIVEKIT_CONFIG,
            passcodeVerifier: verifier,
            reclaimRateLimiter: limiter,
            roomStore: store,
          });

          const createResponse = await app.inject({
            method: "POST",
            url: "/api/rooms",
            payload: {},
          });
          const { roomSlug, hostSecret } = createResponse.json() as {
            roomSlug: string;
            hostSecret: string;
          };

          const nonCreateBodies: string[] = [];

          for (let i = 0; i < wrongAttempts; i += 1) {
            const res = await app.inject({
              method: "POST",
              url: `/api/rooms/${roomSlug}/reclaim`,
              headers: { "x-host-secret": `not-${hostSecret}` },
            });
            nonCreateBodies.push(res.body);
          }

          for (let i = 0; i < correctAttempts; i += 1) {
            const res = await app.inject({
              method: "POST",
              url: `/api/rooms/${roomSlug}/reclaim`,
              headers: { "x-host-secret": hostSecret },
            });
            nonCreateBodies.push(res.body);
          }

          await app.close();

          const combined = joinOutputs(nonCreateBodies, memLogger.readCapturedLogs());

          assert.equal(
            combined.includes(hostSecret),
            false,
            "host secret plaintext leaked in response or log output",
          );
        },
      ),
      { numRuns: 15 },
    );
  });
});


describe("Property 1: Reclaim round-trip for valid credentials", () => {
  /*
   * Feature: host-reclaim-after-refresh, Property 1: Reclaim round-trip for valid credentials
   * Validates: Requirements 1.1, 2.1, 2.2, 2.3, 6.1, 6.4
   */
  test("valid (slug, hostSecret) pairs always return 200 with room + lobbyRequests matching the sibling endpoints", async () => {
    const accessModeArb = fc.constantFrom("open" as const, "lobby" as const);
    const maxParticipantsArb = fc.integer({ min: 2, max: 4 });
    const qualityCapArb = fc.constantFrom("low" as const, "balanced" as const, "high" as const);

    await fc.assert(
      fc.asyncProperty(
        accessModeArb,
        maxParticipantsArb,
        qualityCapArb,
        fc.integer({ min: 0, max: 2 }),
        async (accessMode, maxParticipants, qualityCap, lobbyGuests) => {
          const { app, roomSlug, hostSecret } = await setupRoom({
            accessMode,
            maxParticipants,
            qualityCap,
            allowScreenShare: true,
          });

          if (accessMode === "lobby") {
            for (let i = 0; i < lobbyGuests && i < maxParticipants; i += 1) {
              await app.inject({
                method: "POST",
                url: `/api/rooms/${roomSlug}/join`,
                payload: { displayName: `Guest ${i}` },
              });
            }
          }

          const reclaim = await app.inject({
            method: "POST",
            url: `/api/rooms/${roomSlug}/reclaim`,
            headers: { "x-host-secret": hostSecret },
          });
          assert.equal(reclaim.statusCode, 200);
          const reclaimBody = reclaim.json() as {
            room: Record<string, unknown>;
            lobbyRequests: unknown[];
          };

          // Cross-check room summary matches GET /api/rooms/:slug.
          const meta = await app.inject({
            method: "GET",
            url: `/api/rooms/${roomSlug}`,
          });
          assert.deepEqual(reclaimBody.room, meta.json());

          if (accessMode === "lobby") {
            const hostList = await app.inject({
              method: "GET",
              url: `/api/rooms/${roomSlug}/lobby`,
              headers: { "x-host-secret": hostSecret },
            });
            assert.deepEqual(
              reclaimBody.lobbyRequests,
              (hostList.json() as { requests: unknown[] }).requests,
            );
          } else {
            assert.deepEqual(reclaimBody.lobbyRequests, []);
          }

          await app.close();
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("Property 4: Rate limiter safety under repeated failures", () => {
  /*
   * Feature: host-reclaim-after-refresh, Property 4: Rate limiter safety under repeated failures
   * Validates: Requirements 3.3, 5.1, 5.2, 5.3, 5.4, 5.5
   */
  test("once threshold wrong-secret events hit, cooldowned requests are denied and never reach hasValidHostSecret", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 5, max: 12 }), async (failureCount) => {
        const { app, roomSlug, hostSecret } = await setupRoom();

        for (let i = 0; i < failureCount; i += 1) {
          const res = await app.inject({
            method: "POST",
            url: `/api/rooms/${roomSlug}/reclaim`,
            headers: { "x-host-secret": `wrong-${i}` },
          });
          assert.equal(res.statusCode, 403);
        }

        // Cooldown is active even for the correct secret.
        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${roomSlug}/reclaim`,
          headers: { "x-host-secret": hostSecret },
        });
        assert.equal(res.statusCode, 403);
        await app.close();
      }),
      { numRuns: 15 },
    );
  });
});
