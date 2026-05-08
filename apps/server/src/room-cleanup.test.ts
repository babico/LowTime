import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import fc from "fast-check";

import { buildApp } from "./app.js";
import { recordRoomActivity, computeExpiryFrom } from "./domain/room-activity.js";
import {
  CLOSED_ROOM_GRACE_WINDOW_MS,
  LOBBY_REQUEST_TTL_MS,
  runCleanupTick,
  startCleanupLoop,
  type CleanupScheduler,
} from "./domain/room-cleanup.js";
import {
  createInMemoryRoomStore,
  ROOM_TTL_MS,
} from "./domain/room-store.js";
import { TEST_LIVEKIT_CONFIG, createMemoryLogger } from "./test-helpers.js";

function parseLogLines(raw: string): Array<Record<string, unknown>> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry != null);
}

function cleanupActions(logs: string): string[] {
  return parseLogLines(logs)
    .filter((entry) => entry.event === "room_cleanup")
    .map((entry) => String(entry.action));
}

describe("recordRoomActivity", () => {
  test("bumps lastActivityAt and expiresAt for a known, non-closed room", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );

    const t1 = new Date(t0.getTime() + 30 * 60 * 1000);
    recordRoomActivity(store, room.slug, t1);

    const fetched = store.getRoom(room.slug);
    assert.equal(fetched?.lastActivityAt, t1.toISOString());
    assert.equal(
      fetched?.expiresAt,
      new Date(t1.getTime() + ROOM_TTL_MS).toISOString(),
    );
  });

  test("unknown slug is a no-op and does not throw", () => {
    const store = createInMemoryRoomStore();
    assert.doesNotThrow(() => {
      recordRoomActivity(store, "not-a-room", new Date());
    });
  });

  test("closed room is not bumped", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    room.status = "closed";
    room.closedAt = t0.toISOString();
    const originalExpiry = room.expiresAt;

    recordRoomActivity(store, room.slug, new Date(t0.getTime() + 1_000));

    const fetched = store.getRoom(room.slug);
    assert.equal(fetched?.expiresAt, originalExpiry);
  });

  test("expired room is not bumped", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    const originalExpiry = room.expiresAt;

    // Move past the TTL boundary.
    recordRoomActivity(store, room.slug, new Date(t0.getTime() + ROOM_TTL_MS + 1));

    const fetched = store.getRoom(room.slug);
    assert.equal(fetched?.expiresAt, originalExpiry);
  });

  test("bumps are monotonically non-decreasing across successive calls", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );

    for (const dt of [1_000, 2_000, 3_000, 4_000]) {
      const t = new Date(t0.getTime() + dt);
      recordRoomActivity(store, room.slug, t);
      const fetched = store.getRoom(room.slug);
      assert.equal(fetched?.lastActivityAt, t.toISOString());
    }
  });

  test("computeExpiryFrom returns exactly lastActivityAt + TTL", () => {
    const base = "2026-03-24T12:00:00.000Z";
    assert.equal(
      computeExpiryFrom(base),
      new Date(Date.parse(base) + ROOM_TTL_MS).toISOString(),
    );
  });
});

describe("runCleanupTick", () => {
  function seedActiveRoom(store: ReturnType<typeof createInMemoryRoomStore>, t0: Date) {
    return store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
  }

  test("empty store is a no-op and emits no info records", () => {
    const store = createInMemoryRoomStore();
    const memLogger = createMemoryLogger();
    const result = runCleanupTick(
      store,
      { logger: { info: () => {}, error: () => {} } },
      new Date(),
    );
    assert.deepEqual(result, {
      expiredRoomsRemoved: 0,
      closedRoomsReaped: 0,
      lobbyRequestsTimedOut: 0,
    });
    assert.equal(cleanupActions(memLogger.readCapturedLogs()).length, 0);
  });

  test("removes rooms whose expiresAt is in the past", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = seedActiveRoom(store, t0);

    const memLogger = createMemoryLogger();
    const info = (fields: Record<string, unknown>) => {
      memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
    };
    const logger = { info, error: () => {} };

    // Tick at a time strictly past the room's expiry.
    const tickTime = new Date(t0.getTime() + ROOM_TTL_MS + 1);
    const result = runCleanupTick(store, { logger }, tickTime);

    assert.equal(result.expiredRoomsRemoved, 1);
    assert.equal(store.getRoom(room.slug), undefined);

    const actions = cleanupActions(memLogger.readCapturedLogs());
    assert.equal(actions.filter((a) => a === "room_idle_expired").length, 1);
  });

  test("keeps rooms whose expiresAt is still in the future", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = seedActiveRoom(store, t0);

    const result = runCleanupTick(store, {}, new Date(t0.getTime() + 30 * 60_000));
    assert.equal(result.expiredRoomsRemoved, 0);
    assert.ok(store.getRoom(room.slug) != null);
  });

  test("reaps closed rooms only after the grace window elapses", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = seedActiveRoom(store, t0);
    room.status = "closed";
    room.closedAt = t0.toISOString();

    // Inside the grace window: retain.
    const insideResult = runCleanupTick(
      store,
      {},
      new Date(t0.getTime() + CLOSED_ROOM_GRACE_WINDOW_MS - 1),
    );
    assert.equal(insideResult.closedRoomsReaped, 0);
    assert.ok(store.getRoom(room.slug) != null);

    // At exactly the boundary: reap.
    const atBoundaryResult = runCleanupTick(
      store,
      {},
      new Date(t0.getTime() + CLOSED_ROOM_GRACE_WINDOW_MS),
    );
    assert.equal(atBoundaryResult.closedRoomsReaped, 1);
    assert.equal(store.getRoom(room.slug), undefined);
  });

  test("transitions stale waiting lobby requests to denied with reason lobby_timeout", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "lobby",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    const reqOld = store.createLobbyRequest(room.slug, "OldGuest", t0.toISOString());
    assert.ok(reqOld != null);

    // Fresh request less than the TTL old.
    const tFresh = new Date(t0.getTime() + 5 * 60_000);
    const reqFresh = store.createLobbyRequest(room.slug, "FreshGuest", tFresh.toISOString());
    assert.ok(reqFresh != null);

    const tick = new Date(t0.getTime() + LOBBY_REQUEST_TTL_MS + 1);
    const result = runCleanupTick(store, {}, tick);

    assert.equal(result.lobbyRequestsTimedOut, 1);
    assert.equal(store.getLobbyRequest(room.slug, reqOld.id)?.status, "denied");
    assert.equal(store.getLobbyRequest(room.slug, reqOld.id)?.denialReason, "lobby_timeout");

    // Fresh request is still waiting.
    assert.equal(store.getLobbyRequest(room.slug, reqFresh.id)?.status, "waiting");
  });

  test("does not emit lobby_request_timed_out for requests on a room that itself expires", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "lobby",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    store.createLobbyRequest(room.slug, "Guest", t0.toISOString());

    const memLogger = createMemoryLogger();
    const info = (fields: Record<string, unknown>) => {
      memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
    };
    const logger = { info, error: () => {} };

    const tick = new Date(t0.getTime() + ROOM_TTL_MS + 1);
    const result = runCleanupTick(store, { logger }, tick);

    assert.equal(result.expiredRoomsRemoved, 1);
    assert.equal(result.lobbyRequestsTimedOut, 0);
    const actions = cleanupActions(memLogger.readCapturedLogs());
    assert.equal(actions.includes("lobby_request_timed_out"), false);
    assert.equal(actions.includes("room_idle_expired"), true);
  });

  test("is idempotent: running twice at the same now produces zero new mutations", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "lobby",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    store.createLobbyRequest(room.slug, "Guest", t0.toISOString());

    const memLogger = createMemoryLogger();
    const info = (fields: Record<string, unknown>) => {
      memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
    };
    const logger = { info, error: () => {} };

    const tick = new Date(t0.getTime() + LOBBY_REQUEST_TTL_MS + 1);
    const firstRun = runCleanupTick(store, { logger }, tick);
    const firstLogs = memLogger.readCapturedLogs();

    const secondRun = runCleanupTick(store, { logger }, tick);

    assert.equal(firstRun.lobbyRequestsTimedOut, 1);
    assert.deepEqual(secondRun, {
      expiredRoomsRemoved: 0,
      closedRoomsReaped: 0,
      lobbyRequestsTimedOut: 0,
    });
    // Second tick must not add any new cleanup log records.
    const secondLogs = memLogger.readCapturedLogs().slice(firstLogs.length);
    assert.equal(cleanupActions(secondLogs).length, 0);
  });
});

describe("startCleanupLoop", () => {
  function createFakeScheduler(): {
    scheduler: CleanupScheduler;
    fire: () => void;
    cancelled: boolean[];
    intervalMs: number | null;
  } {
    let callback: (() => void) | null = null;
    let intervalMs: number | null = null;
    const cancelled: boolean[] = [];
    const scheduler: CleanupScheduler = {
      schedule(fn, ms) {
        callback = fn;
        intervalMs = ms;
        return {};
      },
      cancel(_handle) {
        cancelled.push(true);
        void _handle;
      },
    };
    return {
      scheduler,
      fire() {
        if (callback == null) throw new Error("scheduler did not schedule a callback");
        callback();
      },
      get cancelled() {
        return cancelled;
      },
      get intervalMs() {
        return intervalMs;
      },
    };
  }

  test("schedules exactly one callback and the callback runs a tick against the injected now", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );

    const fake = createFakeScheduler();
    const logger = { info: () => {}, error: () => {} };

    // Fast-forward the injected clock past the room's TTL.
    const nowValue = new Date(t0.getTime() + ROOM_TTL_MS + 10);
    const handle = startCleanupLoop({
      store,
      intervalMs: 1_000,
      now: () => nowValue,
      logger,
      scheduler: fake.scheduler,
    });

    assert.equal(fake.intervalMs, 1_000);
    assert.ok(store.getRoom(room.slug) != null);

    fake.fire();
    assert.equal(store.getRoom(room.slug), undefined);

    handle.stop();
    assert.equal(fake.cancelled.length, 1);
  });

  test("catches tick errors and logs one tick_failed record without stopping the loop", () => {
    const errorLog: unknown[] = [];
    const infoLog: unknown[] = [];
    const logger = {
      info: (payload: unknown) => infoLog.push(payload),
      error: (payload: unknown) => errorLog.push(payload),
    };

    // Store stub whose listRoomSlugs throws once, then succeeds.
    let shouldThrow = true;
    const store = {
      ...createInMemoryRoomStore(),
      listRoomSlugs() {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error("boom");
        }
        return [];
      },
    } as unknown as ReturnType<typeof createInMemoryRoomStore>;

    const fake = createFakeScheduler();
    const handle = startCleanupLoop({
      store,
      intervalMs: 500,
      now: () => new Date(),
      logger,
      scheduler: fake.scheduler,
    });

    fake.fire(); // throws, logged
    fake.fire(); // succeeds

    const actions = errorLog.map((p) => (p as { action?: string }).action);
    assert.equal(actions.filter((a) => a === "tick_failed").length, 1);

    handle.stop();
  });
});

describe("buildApp integration: cleanupIntervalMs", () => {
  function createFakeScheduler() {
    let callback: (() => void) | null = null;
    let scheduleCalls = 0;
    let cancelCalls = 0;
    const scheduler: CleanupScheduler = {
      schedule(fn) {
        scheduleCalls += 1;
        callback = fn;
        return { fake: true };
      },
      cancel() {
        cancelCalls += 1;
      },
    };
    return {
      scheduler,
      get scheduleCalls() {
        return scheduleCalls;
      },
      get cancelCalls() {
        return cancelCalls;
      },
      fire() {
        if (callback != null) callback();
      },
    };
  }

  test("starts the loop when cleanupIntervalMs is a positive finite number", async () => {
    const fake = createFakeScheduler();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      cleanupIntervalMs: 60_000,
      cleanupScheduler: fake.scheduler,
    });
    assert.equal(fake.scheduleCalls, 1);

    await app.close();
    assert.equal(fake.cancelCalls, 1);
  });

  for (const invalid of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    test(`does NOT start the loop when cleanupIntervalMs is ${String(invalid)}`, async () => {
      const fake = createFakeScheduler();
      const app = buildApp({
        logger: false,
        liveKitConfig: TEST_LIVEKIT_CONFIG,
        cleanupIntervalMs: invalid as number | undefined,
        cleanupScheduler: fake.scheduler,
      });
      assert.equal(fake.scheduleCalls, 0);
      await app.close();
    });
  }
});

describe("Property: cleanup tick is idempotent for any in-memory store snapshot", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 5: Cleanup tick idempotence
   * Validates: Requirements 4.4, 10.5, 9.5
   */
  test("running the tick twice at the same instant leaves the store in the same shape", () => {
    const scenarioArb = fc.record({
      roomCount: fc.integer({ min: 1, max: 5 }),
      lastActivityOffsetMs: fc.integer({ min: -3 * ROOM_TTL_MS, max: 0 }),
      lobbyRequestCount: fc.integer({ min: 0, max: 3 }),
      lobbyRequestAgeMs: fc.integer({
        min: 0,
        max: 2 * LOBBY_REQUEST_TTL_MS,
      }),
      closedFraction: fc.double({ min: 0, max: 1, noNaN: true }),
      closedAtOffsetMs: fc.integer({
        min: -2 * CLOSED_ROOM_GRACE_WINDOW_MS,
        max: 2 * CLOSED_ROOM_GRACE_WINDOW_MS,
      }),
    });

    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const store = createInMemoryRoomStore();
        const tickTime = new Date("2026-03-24T12:00:00Z");
        const tickMs = tickTime.getTime();

        for (let i = 0; i < scenario.roomCount; i += 1) {
          const lastActivityAt = new Date(tickMs + scenario.lastActivityOffsetMs);
          const initialActivity = lastActivityAt.toISOString();
          const room = store.createRoom(
            {
              accessMode: "lobby",
              maxParticipants: 2,
              qualityCap: "balanced",
              allowScreenShare: true,
              initialActivity,
            },
            lastActivityAt,
          );

          for (let r = 0; r < scenario.lobbyRequestCount; r += 1) {
            const createdAtMs = tickMs - scenario.lobbyRequestAgeMs;
            store.createLobbyRequest(
              room.slug,
              `Guest-${r}`,
              new Date(createdAtMs).toISOString(),
            );
          }

          // Closed rooms sampled via a simple fraction-driven decision.
          if (scenario.closedFraction < 0.3) {
            room.status = "closed";
            room.closedAt = new Date(tickMs - scenario.closedAtOffsetMs).toISOString();
          }
        }

        const firstResult = runCleanupTick(store, {}, tickTime);
        const snapshotAfterFirst = JSON.stringify(
          store.listRoomSlugs().map((slug) => store.getRoom(slug)),
        );

        const secondResult = runCleanupTick(store, {}, tickTime);
        const snapshotAfterSecond = JSON.stringify(
          store.listRoomSlugs().map((slug) => store.getRoom(slug)),
        );

        assert.deepEqual(secondResult, {
          expiredRoomsRemoved: 0,
          closedRoomsReaped: 0,
          lobbyRequestsTimedOut: 0,
        });
        assert.equal(snapshotAfterFirst, snapshotAfterSecond);
        void firstResult;
      }),
      { numRuns: 50 },
    );
  });
});


describe("runCleanupTick: lobby request state preservation", () => {
  test("already-approved lobby requests are left untouched", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "lobby",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    const req = store.createLobbyRequest(room.slug, "Guest", t0.toISOString());
    assert.ok(req != null);
    // Approve so the request enters the `"approved"` state.
    store.approveLobbyRequest(room.slug, req.id);

    const tick = new Date(t0.getTime() + LOBBY_REQUEST_TTL_MS + 1);
    const result = runCleanupTick(store, {}, tick);

    assert.equal(result.lobbyRequestsTimedOut, 0);
    const after = store.getLobbyRequest(room.slug, req.id);
    assert.equal(after?.status, "approved");
  });

  test("a prior host_denied denial is not overwritten by a later lobby_timeout tick", () => {
    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      {
        accessMode: "lobby",
        maxParticipants: 2,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      t0,
    );
    const req = store.createLobbyRequest(room.slug, "Guest", t0.toISOString());
    assert.ok(req != null);
    // Host denied it explicitly. The tick must not overwrite the denial reason
    // even though the request is older than the 10-minute TTL.
    store.denyLobbyRequest(room.slug, req.id, "host_denied");

    const tick = new Date(t0.getTime() + LOBBY_REQUEST_TTL_MS + 1);
    const result = runCleanupTick(store, {}, tick);

    assert.equal(result.lobbyRequestsTimedOut, 0);
    const after = store.getLobbyRequest(room.slug, req.id);
    assert.equal(after?.status, "denied");
    assert.equal(after?.denialReason, "host_denied");
  });
});


describe("Property: activity bump sets expiry exactly TTL in the future", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 1
   * Validates: Requirements 1.2, 1.3, 1.6, 2.1
   */
  test("for any monotonic sequence of bumps, expiresAt always equals lastActivityAt + ROOM_TTL_MS", () => {
    const startArb = fc.date({
      min: new Date("2024-01-01T00:00:00Z"),
      max: new Date("2030-01-01T00:00:00Z"),
      noInvalidDate: true,
    });
    const dtSequenceArb = fc.array(fc.integer({ min: 0, max: 10 * 60 * 1000 }), {
      minLength: 1,
      maxLength: 6,
    });

    fc.assert(
      fc.property(startArb, dtSequenceArb, (start, dts) => {
        const store = createInMemoryRoomStore();
        const room = store.createRoom(
          {
            accessMode: "open",
            maxParticipants: 2,
            qualityCap: "balanced",
            allowScreenShare: true,
          },
          start,
        );

        let currentMs = start.getTime();
        let previousLastActivityMs = Date.parse(room.lastActivityAt);
        for (const dt of dts) {
          currentMs += dt;
          const bumpAt = new Date(currentMs);
          recordRoomActivity(store, room.slug, bumpAt);

          const fetched = store.getRoom(room.slug);
          if (fetched == null) return;
          const lastActivityMs = Date.parse(fetched.lastActivityAt);
          const expiresAtMs = Date.parse(fetched.expiresAt);
          assert.equal(expiresAtMs - lastActivityMs, ROOM_TTL_MS);
          assert.ok(lastActivityMs >= previousLastActivityMs);
          previousLastActivityMs = lastActivityMs;
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: expired-iff from expiresAt", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 2
   * Validates: Requirements 1.3, 3.1
   */
  test("for any stored room and any now, getRoomStatus returns 'expired' iff now >= expiresAt", async () => {
    const { getRoomStatus } = await import("./domain/room-status.js");

    const baseArb = fc.date({
      min: new Date("2024-01-01T00:00:00Z"),
      max: new Date("2030-01-01T00:00:00Z"),
      noInvalidDate: true,
    });
    const offsetArb = fc.integer({ min: -1000, max: 1000 });

    fc.assert(
      fc.property(baseArb, offsetArb, (expiresAt, offsetMs) => {
        const expiresAtMs = expiresAt.getTime();
        const nowMs = expiresAtMs + offsetMs;
        const now = new Date(nowMs);

        const room = {
          slug: "Test",
          accessMode: "open" as const,
          maxParticipants: 2,
          qualityCap: "balanced" as const,
          allowScreenShare: true,
          status: "active" as const,
          expiresAt: expiresAt.toISOString(),
          hostSecret: "stub-host-secret",
          passcodeHash: null,
          sessions: [],
          lobbyRequests: [],
          lastActivityAt: new Date(expiresAtMs - ROOM_TTL_MS).toISOString(),
          closedAt: null,
        };

        const status = getRoomStatus(room, now);
        if (nowMs >= expiresAtMs) {
          assert.equal(status, "expired");
        } else {
          assert.notEqual(status, "expired");
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: no expiry before TTL elapses", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 3
   * Validates: Requirement 3.2
   */
  test("for any activity bump at time t, getRoomStatus(now) != 'expired' for any now in [t, t + ROOM_TTL_MS)", async () => {
    const { getRoomStatus } = await import("./domain/room-status.js");

    const tArb = fc.integer({
      min: Date.UTC(2024, 0, 1),
      max: Date.UTC(2030, 0, 1),
    });
    const deltaArb = fc.integer({ min: 0, max: ROOM_TTL_MS - 1 });

    fc.assert(
      fc.property(tArb, deltaArb, (t, delta) => {
        const store = createInMemoryRoomStore();
        const bumpTime = new Date(t);
        const room = store.createRoom(
          {
            accessMode: "open",
            maxParticipants: 2,
            qualityCap: "balanced",
            allowScreenShare: true,
          },
          bumpTime,
        );

        const now = new Date(t + delta);
        const status = getRoomStatus(room, now);
        assert.notEqual(status, "expired");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: expiry after TTL elapses", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 4
   * Validates: Requirement 3.3
   */
  test("for any activity bump at time t and delta in [ROOM_TTL_MS, 2*ROOM_TTL_MS], getRoomStatus returns 'expired'", async () => {
    const { getRoomStatus } = await import("./domain/room-status.js");

    const tArb = fc.integer({
      min: Date.UTC(2024, 0, 1),
      max: Date.UTC(2030, 0, 1),
    });
    const deltaArb = fc.integer({ min: ROOM_TTL_MS, max: 2 * ROOM_TTL_MS });

    fc.assert(
      fc.property(tArb, deltaArb, (t, delta) => {
        const store = createInMemoryRoomStore();
        const bumpTime = new Date(t);
        const room = store.createRoom(
          {
            accessMode: "open",
            maxParticipants: 2,
            qualityCap: "balanced",
            allowScreenShare: true,
          },
          bumpTime,
        );

        const now = new Date(t + delta);
        const status = getRoomStatus(room, now);
        assert.equal(status, "expired");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: cleanup correctly partitions rooms by fate", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 6
   * Validates: Requirements 4.2, 4.5, 5.1, 5.2, 5.7, 6.2, 6.3
   */
  test("after one tick, surviving rooms match the closed-form partition rule", () => {
    const scenarioArb = fc.record({
      lastActivityOffsetMs: fc.integer({ min: -3 * ROOM_TTL_MS, max: 0 }),
      isClosed: fc.boolean(),
      closedAtOffsetMs: fc.integer({
        min: -2 * CLOSED_ROOM_GRACE_WINDOW_MS,
        max: 2 * CLOSED_ROOM_GRACE_WINDOW_MS,
      }),
      lobbyRequestAges: fc.array(
        fc.integer({ min: 0, max: 2 * LOBBY_REQUEST_TTL_MS }),
        { minLength: 0, maxLength: 3 },
      ),
    });

    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const store = createInMemoryRoomStore();
        const tickTime = new Date("2026-03-24T12:00:00Z");
        const tickMs = tickTime.getTime();

        const lastActivityAt = new Date(tickMs + scenario.lastActivityOffsetMs);
        const room = store.createRoom(
          {
            accessMode: "lobby",
            maxParticipants: 2,
            qualityCap: "balanced",
            allowScreenShare: true,
            initialActivity: lastActivityAt.toISOString(),
          },
          lastActivityAt,
        );

        for (const age of scenario.lobbyRequestAges) {
          store.createLobbyRequest(
            room.slug,
            "Guest",
            new Date(tickMs - age).toISOString(),
          );
        }

        if (scenario.isClosed) {
          room.status = "closed";
          room.closedAt = new Date(tickMs - scenario.closedAtOffsetMs).toISOString();
        }

        runCleanupTick(store, {}, tickTime);

        // Compute the expected fate for the room.
        const survived = store.getRoom(room.slug) != null;
        if (scenario.isClosed) {
          const closedAt = new Date(tickMs - scenario.closedAtOffsetMs).getTime();
          const expected = closedAt + CLOSED_ROOM_GRACE_WINDOW_MS > tickMs;
          assert.equal(survived, expected);
        } else {
          const expiresAt = Date.parse(room.expiresAt);
          const expected = expiresAt > tickMs;
          assert.equal(survived, expected);
        }

        // For surviving live rooms, no waiting lobby request remains past TTL.
        if (survived && !scenario.isClosed) {
          const stillWaiting = store.listLobbyRequests(room.slug);
          for (const req of stillWaiting) {
            assert.ok(
              Date.parse(req.createdAt) + LOBBY_REQUEST_TTL_MS > tickMs,
              "survivor has a stale waiting lobby request",
            );
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: cleanup logs exactly one record per state change", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 7
   * Validates: Requirements 9.1, 9.2, 9.3, 9.5
   */
  test("log record counts match CleanupResult counts for any scenario", () => {
    const scenarioArb = fc.record({
      roomCount: fc.integer({ min: 0, max: 4 }),
      lastActivityOffsetMs: fc.integer({ min: -3 * ROOM_TTL_MS, max: 0 }),
      lobbyRequestCount: fc.integer({ min: 0, max: 3 }),
      lobbyRequestAgeMs: fc.integer({
        min: 0,
        max: 2 * LOBBY_REQUEST_TTL_MS,
      }),
    });

    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const store = createInMemoryRoomStore();
        const tickTime = new Date("2026-03-24T12:00:00Z");
        const tickMs = tickTime.getTime();

        for (let i = 0; i < scenario.roomCount; i += 1) {
          const lastActivityAt = new Date(tickMs + scenario.lastActivityOffsetMs);
          const room = store.createRoom(
            {
              accessMode: "lobby",
              maxParticipants: 2,
              qualityCap: "balanced",
              allowScreenShare: true,
              initialActivity: lastActivityAt.toISOString(),
            },
            lastActivityAt,
          );

          for (let r = 0; r < scenario.lobbyRequestCount; r += 1) {
            store.createLobbyRequest(
              room.slug,
              `Guest-${r}`,
              new Date(tickMs - scenario.lobbyRequestAgeMs).toISOString(),
            );
          }
        }

        const memLogger = createMemoryLogger();
        const info = (fields: Record<string, unknown>) => {
          memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
        };
        const logger = { info, error: () => {} };

        const result = runCleanupTick(store, { logger }, tickTime);

        const actions = cleanupActions(memLogger.readCapturedLogs());
        const counts = {
          room_idle_expired: actions.filter((a) => a === "room_idle_expired").length,
          room_closed_reaped: actions.filter((a) => a === "room_closed_reaped").length,
          lobby_request_timed_out: actions.filter((a) => a === "lobby_request_timed_out").length,
        };

        assert.equal(counts.room_idle_expired, result.expiredRoomsRemoved);
        assert.equal(counts.room_closed_reaped, result.closedRoomsReaped);
        assert.equal(counts.lobby_request_timed_out, result.lobbyRequestsTimedOut);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property: no secret ever appears in cleanup log records", () => {
  /*
   * Feature: room-expiry-and-cleanup, Property 8
   * Validates: Requirement 9.4
   */
  test("for any passcode room that expires on a tick, cleanup logs never mention secrets", async () => {
    const { buildApp: buildApp2 } = await import("./app.js");

    const passcodeCharArb = fc
      .array(
        fc.integer({ min: 0x21, max: 0x7e }).map((code) => String.fromCodePoint(code)),
        { minLength: 8, maxLength: 24 },
      )
      .map((chars) => chars.join(""));

    await fc.assert(
      fc.asyncProperty(passcodeCharArb, async (plaintext) => {
        fc.pre(plaintext.trim() === plaintext);
        fc.pre(!/\p{Cc}/u.test(plaintext));

        const verifier = {
          async hash(value: string) {
            return `$fake$${value}`;
          },
          async verify(encodedHash: string, value: string) {
            return encodedHash === `$fake$${value}`;
          },
        };

        const store = createInMemoryRoomStore();
        let simulated = new Date("2026-03-24T12:00:00Z");
        const memLogger = createMemoryLogger();
        const info = (fields: Record<string, unknown>) => {
          memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
        };
        const errorFn = (fields: Record<string, unknown>) => {
          memLogger.loggerOption.stream.write(JSON.stringify(fields) + "\n");
        };
        const logger = { info, error: errorFn };

        const app = buildApp2({
          logger: false,
          liveKitConfig: TEST_LIVEKIT_CONFIG,
          passcodeVerifier: verifier,
          roomStore: store,
          now: () => simulated,
        });

        const createResponse = await app.inject({
          method: "POST",
          url: "/api/rooms",
          payload: { accessMode: "passcode", passcode: plaintext },
        });
        const { roomSlug, hostSecret } = createResponse.json() as {
          roomSlug: string;
          hostSecret: string;
        };
        const stored = store.getRoom(roomSlug);
        const storedHash = stored?.passcodeHash ?? "";

        // Advance past the TTL and fire one tick. The cleanup tick should
        // expire and delete the room while emitting a log record.
        simulated = new Date(simulated.getTime() + ROOM_TTL_MS + 1);
        runCleanupTick(store, { logger }, simulated);

        await app.close();

        const capturedLogs = memLogger.readCapturedLogs();

        assert.equal(
          capturedLogs.includes(plaintext),
          false,
          "plaintext passcode leaked into cleanup logs",
        );
        assert.equal(
          capturedLogs.includes(hostSecret),
          false,
          "host secret leaked into cleanup logs",
        );
        if (storedHash.length > 0) {
          assert.equal(
            capturedLogs.includes(storedHash),
            false,
            "passcode hash leaked into cleanup logs",
          );
        }
      }),
      { numRuns: 25 },
    );
  });
});
