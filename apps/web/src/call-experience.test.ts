import test from "node:test";
import assert from "node:assert/strict";

import {
  getActiveScreenShareTrack,
  getFirstVideoTrack,
  getParticipant,
  getParticipantLabel,
  getPrimaryParticipant,
  pickPrimaryVideoTrack,
  type ParticipantLike,
  type VideoTrackLike,
} from "./call-experience.js";

function createTrack(kind: string, isMuted = false, source?: string): VideoTrackLike {
  return {
    kind,
    isMuted,
    source,
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

test("getActiveScreenShareTrack returns null when no screen source is present", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["camera", { track: createTrack("video", false, "camera") }],
      ["audio", { track: createTrack("audio") }],
    ]),
  };

  assert.equal(getActiveScreenShareTrack(participant), null);
});

test("getActiveScreenShareTrack returns the screen track when present alongside camera", () => {
  const camera = createTrack("video", false, "camera");
  const screen = createTrack("video", false, "screen_share");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["camera", { track: camera }],
      ["screen", { track: screen }],
    ]),
  };

  assert.equal(getActiveScreenShareTrack(participant), screen);
});

test("getActiveScreenShareTrack ignores muted screen tracks", () => {
  const mutedScreen = createTrack("video", true, "screen_share");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([["screen", { track: mutedScreen }]]),
  };

  assert.equal(getActiveScreenShareTrack(participant), null);
});

test("pickPrimaryVideoTrack prefers the screen share over the camera", () => {
  const camera = createTrack("video", false, "camera");
  const screen = createTrack("video", false, "screen_share");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["camera", { track: camera }],
      ["screen", { track: screen }],
    ]),
  };

  assert.equal(pickPrimaryVideoTrack(participant), screen);
});

test("pickPrimaryVideoTrack falls back to the camera when no screen is active", () => {
  const camera = createTrack("video", false, "camera");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([["camera", { track: camera }]]),
  };

  assert.equal(pickPrimaryVideoTrack(participant), camera);
});

test("pickPrimaryVideoTrack returns null when neither screen nor camera is available", () => {
  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([["audio", { track: createTrack("audio") }]]),
  };

  assert.equal(pickPrimaryVideoTrack(participant), null);
});

test("pickPrimaryVideoTrack ignores a muted screen share and returns the camera", () => {
  const camera = createTrack("video", false, "camera");
  const mutedScreen = createTrack("video", true, "screen_share");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["camera", { track: camera }],
      ["screen", { track: mutedScreen }],
    ]),
  };

  assert.equal(pickPrimaryVideoTrack(participant), camera);
});

test("pickPrimaryVideoTrack handles a null participant", () => {
  assert.equal(pickPrimaryVideoTrack(null), null);
});
