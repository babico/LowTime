import test from "node:test";
import assert from "node:assert/strict";

import { getFirstVideoTrack, getParticipantLabel, type ParticipantLike, type VideoTrackLike } from "./call-experience.js";

function createTrack(kind: string): VideoTrackLike {
  return {
    kind,
    attach(element) {
      return element;
    },
    detach() {
      return [];
    },
  };
}

test("getParticipantLabel prefers participant name before identity and fallback", () => {
  assert.equal(getParticipantLabel({ identity: "sess_1", name: "Sam" }, "Remote participant"), "Sam");
  assert.equal(getParticipantLabel({ identity: "sess_2", name: "   " }, "Remote participant"), "sess_2");
  assert.equal(getParticipantLabel(null, "Remote participant"), "Remote participant");
});

test("getFirstVideoTrack returns the first attached video track", () => {
  const videoTrack = createTrack("video");

  const participant: ParticipantLike = {
    identity: "sess_1",
    name: "Sam",
    trackPublications: new Map([
      ["audio", { track: createTrack("audio") }],
      ["video", { track: videoTrack }],
    ]),
  };

  assert.equal(getFirstVideoTrack(participant), videoTrack);
});

test("getFirstVideoTrack returns null when no video track is present", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    name: "Sam",
    trackPublications: new Map([["audio", { track: createTrack("audio") }]]),
  };

  assert.equal(getFirstVideoTrack(participant), null);
});
