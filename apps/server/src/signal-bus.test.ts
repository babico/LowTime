import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createInMemorySignalBus, type SignalServerEvent } from "./domain/signal-bus.js";

function snapshot(room = "Room123"): SignalServerEvent {
  return {
    kind: "room.snapshot",
    room: {
      slug: room,
      accessMode: "open",
      maxParticipants: 2,
      qualityCap: "balanced",
      allowScreenShare: true,
      status: "created",
      expiresAt: "2026-03-24T18:00:00.000Z",
    },
  };
}

test("subscribe delivers every published event to every handler", () => {
  const bus = createInMemorySignalBus();
  const a: SignalServerEvent[] = [];
  const b: SignalServerEvent[] = [];

  bus.subscribe("Room123", (ev) => a.push(ev));
  bus.subscribe("Room123", (ev) => b.push(ev));

  bus.publish("Room123", snapshot());
  bus.publish("Room123", snapshot());

  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
});

test("subscribe returns an unsubscribe that stops further deliveries for that handler", () => {
  const bus = createInMemorySignalBus();
  const received: SignalServerEvent[] = [];

  const off = bus.subscribe("Room123", (ev) => received.push(ev));
  bus.publish("Room123", snapshot());
  off();
  bus.publish("Room123", snapshot());

  assert.equal(received.length, 1);
});

test("publish is a no-op on a slug with no subscribers", () => {
  const bus = createInMemorySignalBus();
  assert.doesNotThrow(() => {
    bus.publish("Room123", snapshot());
  });
});

test("events for one slug do not reach subscribers on another slug", () => {
  const bus = createInMemorySignalBus();
  const a: SignalServerEvent[] = [];
  const b: SignalServerEvent[] = [];

  bus.subscribe("Room-A", (ev) => a.push(ev));
  bus.subscribe("Room-B", (ev) => b.push(ev));

  bus.publish("Room-A", snapshot("Room-A"));

  assert.equal(a.length, 1);
  assert.equal(b.length, 0);
});

test("handler throws are caught, logged, and do not stop subsequent handlers", () => {
  const errors: unknown[] = [];
  const bus = createInMemorySignalBus({
    error(payload) {
      errors.push(payload);
    },
  });

  const b: SignalServerEvent[] = [];

  bus.subscribe("Room123", () => {
    throw new Error("handler exploded");
  });
  bus.subscribe("Room123", (ev) => b.push(ev));

  bus.publish("Room123", snapshot());

  assert.equal(b.length, 1);
  assert.equal(errors.length, 1);
});
