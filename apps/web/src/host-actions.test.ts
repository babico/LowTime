import assert from "node:assert/strict";
import test from "node:test";

import { removeParticipantRequest } from "./host-actions.js";

test("removeParticipantRequest sends a POST to the participants/remove endpoint with the host secret header", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true, removedSessionId: "sess_target" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await removeParticipantRequest({
    apiBaseUrl: "https://api.example.com",
    slug: "alpha",
    sessionId: "sess_target",
    hostSecret: "host-secret-1",
    fetcher,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.removedSessionId, "sess_target");
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.example.com/api/rooms/alpha/participants/sess_target/remove");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["x-host-secret"], "host-secret-1");
});

test("removeParticipantRequest surfaces a server-side error message", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Participant is not in this room" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  const result = await removeParticipantRequest({
    apiBaseUrl: "https://api.example.com",
    slug: "alpha",
    sessionId: "sess_target",
    hostSecret: "host-secret-1",
    fetcher,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "Participant is not in this room");
  }
});

test("removeParticipantRequest rejects an empty host secret before hitting the network", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("should not be called");
  };

  const result = await removeParticipantRequest({
    apiBaseUrl: "https://api.example.com",
    slug: "alpha",
    sessionId: "sess_target",
    hostSecret: "",
    fetcher,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /host secret/i);
  }
});

test("removeParticipantRequest uses a generic message when the body is not JSON", async () => {
  const fetcher: typeof fetch = async () => new Response("not json", { status: 500 });

  const result = await removeParticipantRequest({
    apiBaseUrl: "https://api.example.com",
    slug: "alpha",
    sessionId: "sess_target",
    hostSecret: "host-secret-1",
    fetcher,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /server/i);
  }
});

test("removeParticipantRequest surfaces network failures with a useful message", async () => {
  const fetcher: typeof fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const result = await removeParticipantRequest({
    apiBaseUrl: "https://api.example.com",
    slug: "alpha",
    sessionId: "sess_target",
    hostSecret: "host-secret-1",
    fetcher,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /network/i);
  }
});
