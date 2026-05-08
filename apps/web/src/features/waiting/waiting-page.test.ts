import assert from "node:assert/strict";
import test from "node:test";

import { getLobbyDenialMessage } from "./waiting-page.js";

test("getLobbyDenialMessage returns a distinct non-empty copy for every reason", () => {
  const reasons = ["host_denied", "room_expired", "room_closed", "lobby_timeout"] as const;

  const messages = reasons.map((reason) => getLobbyDenialMessage(reason));

  for (const message of messages) {
    assert.ok(message.length > 0);
  }

  // All four messages must be pairwise distinct so the UI actually differentiates.
  assert.equal(new Set(messages).size, messages.length);
});

test("getLobbyDenialMessage uses the new wording for lobby_timeout", () => {
  const message = getLobbyDenialMessage("lobby_timeout");
  assert.ok(/10 minutes/i.test(message), "lobby_timeout copy should mention the 10-minute window");
});

test("getLobbyDenialMessage preserves room_expired copy wording", () => {
  const message = getLobbyDenialMessage("room_expired");
  assert.ok(/expired/i.test(message));
});

test("getLobbyDenialMessage preserves host_denied copy wording", () => {
  const message = getLobbyDenialMessage("host_denied");
  assert.ok(/host/i.test(message));
});
