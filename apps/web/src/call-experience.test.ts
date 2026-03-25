import test from "node:test";
import assert from "node:assert/strict";

import {
  getFirstVideoTrack,
  getParticipant,
  getParticipantLabel,
  getPrimaryParticipant,
  type ParticipantLike,
  type VideoTrackLike,
} from "./call-experience.js";

function createTrack(kind: string, isMuted = false): VideoTrackLike {
  return {
    kind,
    isMuted,
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

test("getPrimaryParticipant returns the first participant-like entry", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    name: "Sam",
    trackPublications: new Map(),
  };

  assert.equal(getPrimaryParticipant([null, { nope: true }, participant]), participant);
  assert.equal(getPrimaryParticipant([null, { nope: true }]), null);
});

test("getParticipant validates a single participant-like value", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    name: "Sam",
    trackPublications: new Map(),
  };

  assert.equal(getParticipant(participant), participant);
  assert.equal(getParticipant({ bad: true }), null);
});

test("getFirstVideoTrack ignores muted video tracks", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    name: "Sam",
    trackPublications: new Map([
      ["muted-video", { track: createTrack("video", true) }],
      ["audio", { track: createTrack("audio") }],
    ]),
  };

  assert.equal(getFirstVideoTrack(participant), null);
});
