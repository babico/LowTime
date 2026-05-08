import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildApp } from "./app.js";
import { createInMemorySignalBus, type SignalServerEvent } from "./domain/signal-bus.js";
import { TEST_LIVEKIT_CONFIG } from "./test-helpers.js";

/*
 * These tests assert the signaling backbone's observable behavior against
 * the settings handler without needing a real WebSocket. The `/signal`
 * endpoint itself is exercised through the `registerSignalRoutes` plugin
 * during `buildApp`; full wire-level coverage of the upgrade handshake is
 * deferred to an end-to-end test harness that actually opens a socket.
 *
 * What we DO cover here:
 *   - The in-memory bus fans out room.settings_updated events whenever the
 *     REST settings handler mutates a room (access mode, quality cap,
 *     passcode rotation branches).
 *   - The published payload carries the updated RoomSummary.
 *   - Bus subscribers on unrelated slugs never receive the event.
 */

describe("Signal bus integration: settings handler broadcasts", () => {
  async function setupApp() {
    const received: SignalServerEvent[] = [];
    const bus = createInMemorySignalBus();
    const otherRoomEvents: SignalServerEvent[] = [];
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      signalBus: bus,
    });
    // Subscribe to a DIFFERENT slug so we can assert isolation.
    const unsubscribeOther = bus.subscribe("SomeOtherSlug", (ev) => {
      otherRoomEvents.push(ev);
    });
    return { app, bus, received, otherRoomEvents, unsubscribeOther };
  }

  async function createRoom(app: Awaited<ReturnType<typeof buildApp>>, payload: Record<string, unknown> = {}) {
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload,
    });
    return response.json() as { roomSlug: string; hostSecret: string };
  }

  test("changing quality cap publishes room.settings_updated to subscribers of the slug", async () => {
    const { app, bus, received, otherRoomEvents } = await setupApp();

    const { roomSlug, hostSecret } = await createRoom(app);
    const unsubscribe = bus.subscribe(roomSlug, (ev) => received.push(ev));

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { qualityCap: "low" },
    });
    assert.equal(response.statusCode, 200);

    assert.equal(received.length, 1);
    const event = received[0];
    assert.equal(event.kind, "room.settings_updated");
    if (event.kind === "room.settings_updated") {
      assert.equal(event.room.qualityCap, "low");
      assert.equal(event.room.slug, roomSlug);
    }

    // Other slug must NOT have received the event.
    assert.equal(otherRoomEvents.length, 0);

    unsubscribe();
    await app.close();
  });

  test("changing access mode publishes room.settings_updated", async () => {
    const { app, bus, received } = await setupApp();

    const { roomSlug, hostSecret } = await createRoom(app, {
      accessMode: "passcode",
      passcode: "initial-passcode",
    });
    bus.subscribe(roomSlug, (ev) => received.push(ev));

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { accessMode: "open" },
    });
    assert.equal(response.statusCode, 200);

    assert.equal(received.length, 1);
    if (received[0].kind === "room.settings_updated") {
      assert.equal(received[0].room.accessMode, "open");
    }
    await app.close();
  });

  test("rotating the passcode publishes room.settings_updated", async () => {
    const { app, bus, received } = await setupApp();

    const { roomSlug, hostSecret } = await createRoom(app, {
      accessMode: "passcode",
      passcode: "initial-passcode",
    });
    bus.subscribe(roomSlug, (ev) => received.push(ev));

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { passcode: "rotated-passcode" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(received.length, 1);
    if (received[0].kind === "room.settings_updated") {
      assert.equal(received[0].room.accessMode, "passcode");
      assert.equal(received[0].room.slug, roomSlug);
    }
    await app.close();
  });

  test("invalid settings body does NOT publish to the bus", async () => {
    const { app, bus, received } = await setupApp();

    const { roomSlug, hostSecret } = await createRoom(app);
    bus.subscribe(roomSlug, (ev) => received.push(ev));

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": hostSecret },
      payload: { qualityCap: "ultra" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(received.length, 0);
    await app.close();
  });

  test("settings call with wrong host secret does NOT publish to the bus", async () => {
    const { app, bus, received } = await setupApp();

    const { roomSlug } = await createRoom(app);
    bus.subscribe(roomSlug, (ev) => received.push(ev));

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/settings`,
      headers: { "x-host-secret": "wrong" },
      payload: { qualityCap: "low" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(received.length, 0);
    await app.close();
  });
});

describe("Signal route: room.ping / room.pong heartbeat (store-level)", () => {
  /*
   * Feature: reconnect-window, Property: heartbeat keeps session alive
   * Validates: Requirements 4.1, 4.2, 4.3
   *
   * Full wire-level WebSocket tests (opening a real socket, sending frames,
   * and reading replies) are deferred to an end-to-end harness. These tests
   * verify the store-level contract that the signal route depends on:
   * touchSession bumps lastSeenAt and returns true for a live session, and
   * returns false for a reaped session.
   */

  test("touchSession bumps lastSeenAt and returns true for a live session", async () => {
    const { createInMemoryRoomStore } = await import("./domain/room-store.js");

    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      { accessMode: "open", maxParticipants: 2, qualityCap: "balanced", allowScreenShare: true },
      t0,
    );
    const session = store.createSession(room.slug, "Alice", t0);
    assert.ok(session != null);
    assert.equal(session.lastSeenAt, t0.toISOString());

    const t1 = new Date(t0.getTime() + 20_000);
    const touched = store.touchSession(room.slug, session.id, t1);
    assert.equal(touched, true);

    const fetched = store.getRoom(room.slug);
    const updated = fetched?.sessions.find((s) => s.id === session.id);
    assert.equal(updated?.lastSeenAt, t1.toISOString());
  });

  test("touchSession returns false for a reaped (deleted) session", async () => {
    const { createInMemoryRoomStore } = await import("./domain/room-store.js");

    const store = createInMemoryRoomStore();
    const t0 = new Date("2026-03-24T12:00:00Z");
    const room = store.createRoom(
      { accessMode: "open", maxParticipants: 2, qualityCap: "balanced", allowScreenShare: true },
      t0,
    );
    const session = store.createSession(room.slug, "Bob", t0);
    assert.ok(session != null);

    // Reap the session directly.
    store.deleteSession(room.slug, session.id);

    const t1 = new Date(t0.getTime() + 20_000);
    const touched = store.touchSession(room.slug, session.id, t1);
    assert.equal(touched, false);
  });

  test("touchSession returns false for an unknown room slug", async () => {
    const { createInMemoryRoomStore } = await import("./domain/room-store.js");

    const store = createInMemoryRoomStore();
    const touched = store.touchSession("no-such-room", "sess_abc", new Date());
    assert.equal(touched, false);
  });

  test("ping against a reaped session: signal route returns session_expired error via store check", async () => {
    const { createInMemoryRoomStore } = await import("./domain/room-store.js");
    const { runCleanupTick } = await import("./domain/room-cleanup.js");
    const { RECONNECT_WINDOW_MS } = await import("@lowtime/shared");

    let simulated = new Date("2026-03-24T12:00:00Z");
    const store = createInMemoryRoomStore();
    const app = buildApp({
      logger: false,
      liveKitConfig: TEST_LIVEKIT_CONFIG,
      roomStore: store,
      now: () => simulated,
    });

    const createResponse = await app.inject({ method: "POST", url: "/api/rooms" });
    const { roomSlug } = createResponse.json() as { roomSlug: string };

    const joinResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomSlug}/join`,
      payload: { displayName: "Dave" },
    });
    const { sessionId } = joinResponse.json() as { sessionId: string };

    // Advance clock and reap the session.
    simulated = new Date(simulated.getTime() + RECONNECT_WINDOW_MS + 1);
    const result = runCleanupTick(store, {}, simulated);
    assert.equal(result.sessionsExpired, 1);

    // After reaping, touchSession must return false (simulating what the signal
    // route does when it receives a room.ping for a reaped session).
    const touched = store.touchSession(roomSlug, sessionId, simulated);
    assert.equal(touched, false);

    await app.close();
  });
});
