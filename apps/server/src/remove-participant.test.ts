import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { attemptRemoveParticipant } from "./domain/remove-participant.js";
import { createInMemoryRoomStore } from "./domain/room-store.js";

function setup(opts: { sessionCount?: number; includeHostSession?: boolean } = {}) {
  const store = createInMemoryRoomStore();
  const created = store.createRoom(
    {
      accessMode: "open",
      maxParticipants: 4,
      qualityCap: "balanced",
      allowScreenShare: true,
    },
    new Date("2026-06-22T00:00:00Z"),
  );
  assert.ok(created != null, "createRoom returned a room");
  const room = store.getRoom(created.slug)!;
  const hostSession = store.createSession(created.slug, "Host", new Date("2026-06-22T00:00:00Z"));
  assert.ok(hostSession != null, "createSession returned a host session");
  void opts.includeHostSession;
  const others: { id: string }[] = [];
  for (let i = 0; i < (opts.sessionCount ?? 1); i += 1) {
    const s = store.createSession(created.slug, `Guest${i}`, new Date("2026-06-22T00:00:00Z"));
    assert.ok(s != null);
    others.push(s!);
  }
  return { store, room, hostSession, others };
}

describe("attemptRemoveParticipant", () => {
  test("rejects when the host secret is missing", () => {
    const { store, room, others } = setup();
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: undefined,
      targetSessionId: others[0]!.id,
      now: new Date("2026-06-22T00:00:01Z"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /host/i);
    }
  });

  test("rejects when the host secret is wrong", () => {
    const { store, room, others } = setup();
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: "wrong",
      targetSessionId: others[0]!.id,
      now: new Date("2026-06-22T00:00:01Z"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_host_secret");
    }
  });

  test("rejects when the target session is unknown", () => {
    const { store, room } = setup();
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: room.hostSecret,
      targetSessionId: "sess_does_not_exist",
      now: new Date("2026-06-22T00:00:01Z"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "target_not_found");
    }
  });

  test("removes the target session and reports it", () => {
    const { store, room, others } = setup();
    const before = store.getRoom(room.slug)!.sessions.length;
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: room.hostSecret,
      targetSessionId: others[0]!.id,
      now: new Date("2026-06-22T00:00:01Z"),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.removed.id, others[0]!.id);
    }
    assert.equal(store.getRoom(room.slug)!.sessions.length, before - 1);
  });

  test("refuses to remove the only host session", () => {
    const store = createInMemoryRoomStore();
    const created = store.createRoom(
      {
        accessMode: "open",
        maxParticipants: 4,
        qualityCap: "balanced",
        allowScreenShare: true,
      },
      new Date("2026-06-22T00:00:00Z"),
    );
    assert.ok(created != null);
    const room = store.getRoom(created.slug)!;
    const host = store.createSession(created.slug, "Host", new Date("2026-06-22T00:00:00Z"));
    assert.ok(host != null);
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: room.hostSecret,
      targetSessionId: host!.id,
      now: new Date("2026-06-22T00:00:01Z"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "cannot_remove_host");
    }
  });

  test("bumps lastActivityAt to the supplied now", () => {
    const { store, room, others } = setup();
    const before = store.getRoom(room.slug)!.lastActivityAt;
    const now = new Date("2026-06-22T01:00:00Z");
    const result = attemptRemoveParticipant({
      room: store.getRoom(room.slug)!,
      hostSecret: room.hostSecret,
      targetSessionId: others[0]!.id,
      now,
    });
    assert.equal(result.ok, true);
    assert.equal(store.getRoom(room.slug)!.lastActivityAt, now.toISOString());
    assert.notEqual(store.getRoom(room.slug)!.lastActivityAt, before);
  });
});
