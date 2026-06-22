import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllVideoParticipants,
  getFirstVideoTrack,
  getParticipant,
  getParticipantLabel,
  getParticipantVideoTrack,
  getPrimaryParticipant,
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

test("getAllVideoParticipants returns every remote participant that has a video track", () => {
  const camera1 = createTrack("video", false, "camera");
  const camera2 = createTrack("video", false, "camera");
  const audioOnly = createTrack("audio");

  const p1: ParticipantLike = {
    identity: "sess_1",
    name: "Alice",
    trackPublications: new Map([["camera", { track: camera1 }]]),
  };
  const p2: ParticipantLike = {
    identity: "sess_2",
    name: "Bob",
    trackPublications: new Map([["camera", { track: camera2 }]]),
  };
  const p3: ParticipantLike = {
    identity: "sess_3",
    name: "Carol",
    trackPublications: new Map([["audio", { track: audioOnly }]]),
  };

  const result = getAllVideoParticipants([p1, p2, p3]);

  assert.deepEqual(
    result.map((p) => p.identity),
    ["sess_1", "sess_2"],
  );
});

test("getAllVideoParticipants returns an empty array when the iterable is empty or all audio-only", () => {
  assert.deepEqual(getAllVideoParticipants([]), []);
  const audio: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([["audio", { track: createTrack("audio") }]]),
  };
  assert.deepEqual(getAllVideoParticipants([audio]), []);
});

test("getAllVideoParticipants tolerates invalid entries", () => {
  const camera = createTrack("video", false, "camera");
  const valid: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([["camera", { track: camera }]]),
  };
  const result = getAllVideoParticipants([null, { nope: true }, valid]);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.identity, "sess_1");
});

test("getParticipantVideoTrack returns the first attached track for the requested source", () => {
  const camera = createTrack("video", false, "camera");
  const screen = createTrack("video", false, "screen_share");
  const audio = createTrack("audio");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["audio", { track: audio }],
      ["camera", { track: camera }],
      ["screen", { track: screen }],
    ]),
  };

  assert.equal(getParticipantVideoTrack(participant, "camera"), camera);
  assert.equal(getParticipantVideoTrack(participant, "screen_share"), screen);
});

test("getParticipantVideoTrack returns null when the source is missing or muted", () => {
  const camera = createTrack("video", false, "camera");
  const mutedScreen = createTrack("video", true, "screen_share");

  const participant: ParticipantLike = {
    identity: "sess_1",
    trackPublications: new Map([
      ["camera", { track: camera }],
      ["screen", { track: mutedScreen }],
    ]),
  };

  assert.equal(getParticipantVideoTrack(participant, "screen_share"), null);
  assert.equal(getParticipantVideoTrack(participant, "microphone"), null);
});

test("getParticipantVideoTrack handles a null participant", () => {
  assert.equal(getParticipantVideoTrack(null, "camera"), null);
});
