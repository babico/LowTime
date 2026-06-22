import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildRoomModeration } from "./use-room-moderation.js";

function makeFetch(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return (async (input, init) => handler(String(input), init ?? {})) as typeof fetch;
}

function setup() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = makeFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, removedSessionId: "sess_target" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { calls, fetcher };
}

describe("buildRoomModeration", () => {
  test("removeParticipant POSTs to the participants/remove endpoint with the host secret", async () => {
    const { calls, fetcher } = setup();
    const mod = buildRoomModeration({
      apiBaseUrl: "https://api.example.com",
      slug: "alpha",
      hostSecret: "host-secret-1",
      fetcher,
    });

    const result = await mod.removeParticipant({ sessionId: "sess_target" });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.removedSessionId, "sess_target");
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://api.example.com/api/rooms/alpha/participants/sess_target/remove");
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["x-host-secret"], "host-secret-1");
  });

  test("isHostSecretMissing is true when the host secret is blank", () => {
    const mod = buildRoomModeration({
      apiBaseUrl: "https://api.example.com",
      slug: "alpha",
      hostSecret: "",
    });
    assert.equal(mod.isHostSecretMissing(), true);
  });

  test("isHostSecretMissing is false when the host secret is set", () => {
    const mod = buildRoomModeration({
      apiBaseUrl: "https://api.example.com",
      slug: "alpha",
      hostSecret: "host-secret-1",
    });
    assert.equal(mod.isHostSecretMissing(), false);
  });

  test("removeParticipant surfaces server-side error messages", async () => {
    const fetcher = makeFetch(async () =>
      new Response(JSON.stringify({ message: "Participant is not in this room" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const mod = buildRoomModeration({
      apiBaseUrl: "https://api.example.com",
      slug: "alpha",
      hostSecret: "host-secret-1",
      fetcher,
    });

    const result = await mod.removeParticipant({ sessionId: "sess_target" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, "Participant is not in this room");
    }
  });

  test("removeParticipant returns a host-secret error when the secret is blank", async () => {
    const { calls } = setup();
    const mod = buildRoomModeration({
      apiBaseUrl: "https://api.example.com",
      slug: "alpha",
      hostSecret: "",
      fetcher: makeFetch(async (url, init) => {
        calls.push({ url, init });
        throw new Error("should not be called");
      }),
    });

    const result = await mod.removeParticipant({ sessionId: "sess_target" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /host secret/i);
    }
    assert.equal(calls.length, 0);
  });
});
