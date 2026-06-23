import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGroupRoomTuning,
  isGroupRoom,
  type EffectivePublishOptionsForTuning,
} from "./group-room-tuning.js";

function baseOptions(overrides: Partial<EffectivePublishOptionsForTuning> = {}): EffectivePublishOptionsForTuning {
  return {
    resolution: { width: 640, height: 360, frameRate: 15 },
    maxBitrateKbps: 500,
    audioOnly: false,
    audioPriority: false,
    receiveVideo: true,
    ...overrides,
  };
}

test("isGroupRoom flags rooms with more than two participants", () => {
  assert.equal(isGroupRoom(2), false);
  assert.equal(isGroupRoom(3), true);
  assert.equal(isGroupRoom(4), true);
  assert.equal(isGroupRoom(undefined), false);
  assert.equal(isGroupRoom(0), false);
});

test("applyGroupRoomTuning is a no-op for 1:1 rooms", () => {
  const options = baseOptions();
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: false });
  assert.equal(tuned, options);
});

test("applyGroupRoomTuning lowers maxBitrateKbps by 40% for group rooms", () => {
  const options = baseOptions({ maxBitrateKbps: 700 });
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: true });
  assert.equal(tuned.maxBitrateKbps, 420);
});

test("applyGroupRoomTuning leaves audioOnly and audioPriority alone", () => {
  const options = baseOptions({ audioOnly: true, audioPriority: true, maxBitrateKbps: 800 });
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: true });
  assert.equal(tuned.audioOnly, true);
  assert.equal(tuned.audioPriority, true);
  assert.equal(tuned.maxBitrateKbps, 480);
});

test("applyGroupRoomTuning floors the bitrate at 80 kbps so audio-only stays usable", () => {
  const options = baseOptions({ maxBitrateKbps: 100 });
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: true });
  assert.equal(tuned.maxBitrateKbps, 80);
});

test("applyGroupRoomTuning never raises the bitrate", () => {
  const options = baseOptions({ maxBitrateKbps: 100 });
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: true });
  assert.ok(tuned.maxBitrateKbps <= options.maxBitrateKbps);
});

test("applyGroupRoomTuning rounds to the nearest kbps and rejects non-numeric input", () => {
  const options = baseOptions({ maxBitrateKbps: 333 });
  const tuned = applyGroupRoomTuning({ options, isGroupRoom: true });
  assert.equal(tuned.maxBitrateKbps, 200);
});

test("applyGroupRoomTuning throws when the bitrate is negative or non-finite", () => {
  const options = baseOptions({ maxBitrateKbps: -1 });
  assert.throws(() => applyGroupRoomTuning({ options, isGroupRoom: true }), /maxBitrateKbps/);

  const nanOptions = baseOptions({ maxBitrateKbps: Number.NaN });
  assert.throws(() => applyGroupRoomTuning({ options: nanOptions, isGroupRoom: true }), /maxBitrateKbps/);
});
