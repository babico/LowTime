import assert from "node:assert/strict";
import test from "node:test";

import type { JoinRoomResponse } from "@lowtime/shared";

import { derivePasscodeDeniedMessage } from "./room-page.js";

test("derivePasscodeDeniedMessage returns null when no denial is active", () => {
  assert.equal(derivePasscodeDeniedMessage(null), null);

  const directResult: JoinRoomResponse = {
    joinState: "direct",
    sessionId: "sess_1",
    transportPreference: "sfu",
  };
  assert.equal(derivePasscodeDeniedMessage(directResult), null);

  const waitingResult: JoinRoomResponse = {
    joinState: "waiting",
    requestId: "req_1",
  };
  assert.equal(derivePasscodeDeniedMessage(waitingResult), null);
});

test("derivePasscodeDeniedMessage surfaces passcode_required with user-facing copy", () => {
  const result: JoinRoomResponse = {
    joinState: "denied",
    reason: "passcode_required",
  };
  const message = derivePasscodeDeniedMessage(result);
  assert.ok(message != null);
  assert.ok(/required/i.test(message));
});

test("derivePasscodeDeniedMessage surfaces invalid_passcode with user-facing copy", () => {
  const result: JoinRoomResponse = {
    joinState: "denied",
    reason: "invalid_passcode",
  };
  const message = derivePasscodeDeniedMessage(result);
  assert.ok(message != null);
  assert.ok(/incorrect/i.test(message));
});

test("derivePasscodeDeniedMessage ignores unrelated denial reasons", () => {
  for (const reason of ["room_full", "room_expired"] as const) {
    const result: JoinRoomResponse = {
      joinState: "denied",
      reason,
    };
    assert.equal(derivePasscodeDeniedMessage(result), null);
  }
});
