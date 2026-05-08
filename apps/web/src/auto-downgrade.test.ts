import assert from "node:assert/strict";
import test from "node:test";

import {
  computeDowngradeStep,
  deriveRungOptions,
  getRungLabel,
  type DowngradeRung,
} from "./auto-downgrade.js";
import type { EffectivePublishOptions } from "./quality-presets.js";

const DWELL_MS = 10_000;

const BASE: EffectivePublishOptions = {
  resolution: { width: 640, height: 360, frameRate: 15 },
  maxBitrateKbps: 500,
  audioOnly: false,
  audioPriority: false,
  receiveVideo: true,
};

test("computeDowngradeStep: good health holds at 'none' when already there", () => {
  const { next } = computeDowngradeStep({
    networkHealth: "good",
    current: "none",
    now: 1_000_000,
    lastTransitionAt: 0,
  });
  assert.equal(next, "none");
});

test("computeDowngradeStep: poor health steps DOWN one rung when dwell elapsed", () => {
  const { next, lastTransitionAt } = computeDowngradeStep({
    networkHealth: "poor",
    current: "none",
    now: DWELL_MS,
    lastTransitionAt: 0,
  });
  assert.equal(next, "bitrate");
  assert.equal(lastTransitionAt, DWELL_MS);
});

test("computeDowngradeStep: poor health holds when dwell has NOT elapsed", () => {
  const { next, lastTransitionAt } = computeDowngradeStep({
    networkHealth: "poor",
    current: "bitrate",
    now: 1_000,
    lastTransitionAt: 0,
  });
  assert.equal(next, "bitrate");
  assert.equal(lastTransitionAt, 0);
});

test("computeDowngradeStep: full descending path under sustained poor", () => {
  const path: DowngradeRung[] = [];
  let current: DowngradeRung = "none";
  let lastTransitionAt = 0;
  for (let tick = 0; tick < 5; tick += 1) {
    const now = (tick + 1) * DWELL_MS;
    const result = computeDowngradeStep({
      networkHealth: "poor",
      current,
      now,
      lastTransitionAt,
    });
    current = result.next;
    lastTransitionAt = result.lastTransitionAt;
    path.push(current);
  }
  assert.deepEqual(path, [
    "bitrate",
    "resolution",
    "frame-rate",
    "video-paused",
    "video-paused", // stays at the bottom
  ]);
});

test("computeDowngradeStep: good health reverses the ladder one rung per tick", () => {
  const path: DowngradeRung[] = [];
  let current: DowngradeRung = "video-paused";
  let lastTransitionAt = 0;
  for (let tick = 0; tick < 5; tick += 1) {
    const now = (tick + 1) * DWELL_MS;
    const result = computeDowngradeStep({
      networkHealth: "good",
      current,
      now,
      lastTransitionAt,
    });
    current = result.next;
    lastTransitionAt = result.lastTransitionAt;
    path.push(current);
  }
  assert.deepEqual(path, [
    "frame-rate",
    "resolution",
    "bitrate",
    "none",
    "none",
  ]);
});

test("computeDowngradeStep: fair health holds at shallow rungs and loosens deeper ones", () => {
  // At rung "bitrate", fair should hold.
  let result = computeDowngradeStep({
    networkHealth: "fair",
    current: "bitrate",
    now: DWELL_MS,
    lastTransitionAt: 0,
  });
  assert.equal(result.next, "bitrate");

  // At rung "frame-rate" (deeper than bitrate), fair allows gentle
  // loosening one rung toward resolution after the dwell.
  result = computeDowngradeStep({
    networkHealth: "fair",
    current: "frame-rate",
    now: DWELL_MS,
    lastTransitionAt: 0,
  });
  assert.equal(result.next, "resolution");
});

test("computeDowngradeStep: offline freezes the current rung", () => {
  for (const current of [
    "none",
    "bitrate",
    "resolution",
    "frame-rate",
    "video-paused",
  ] as DowngradeRung[]) {
    const { next } = computeDowngradeStep({
      networkHealth: "offline",
      current,
      now: 10 * DWELL_MS,
      lastTransitionAt: 0,
    });
    assert.equal(next, current, `offline must freeze current rung ${current}`);
  }
});

test("computeDowngradeStep: reconnecting also freezes the ladder", () => {
  const { next } = computeDowngradeStep({
    networkHealth: "reconnecting",
    current: "bitrate",
    now: 10 * DWELL_MS,
    lastTransitionAt: 0,
  });
  assert.equal(next, "bitrate");
});

test("deriveRungOptions: 'none' returns the base verbatim", () => {
  assert.deepEqual(deriveRungOptions(BASE, "none"), BASE);
});

test("deriveRungOptions: 'bitrate' halves maxBitrateKbps but leaves resolution and fps", () => {
  const result = deriveRungOptions(BASE, "bitrate");
  assert.equal(result.maxBitrateKbps, 250);
  assert.deepEqual(result.resolution, BASE.resolution);
});

test("deriveRungOptions: 'resolution' halves width, height, and bitrate; keeps fps", () => {
  const result = deriveRungOptions(BASE, "resolution");
  assert.equal(result.resolution.width, 320);
  assert.equal(result.resolution.height, 180);
  assert.equal(result.resolution.frameRate, BASE.resolution.frameRate);
  assert.equal(result.maxBitrateKbps, 250);
});

test("deriveRungOptions: 'frame-rate' additionally halves fps", () => {
  const result = deriveRungOptions(BASE, "frame-rate");
  assert.equal(result.resolution.frameRate, 7);
});

test("deriveRungOptions: 'video-paused' sets audioOnly=true, leaves base resolution untouched", () => {
  const result = deriveRungOptions(BASE, "video-paused");
  assert.equal(result.audioOnly, true);
  assert.deepEqual(result.resolution, BASE.resolution);
});

test("getRungLabel returns distinct copy for every downgrade rung", () => {
  const labels = (
    ["none", "bitrate", "resolution", "frame-rate", "video-paused"] as DowngradeRung[]
  ).map((r) => getRungLabel(r));

  assert.equal(labels[0], "");
  assert.equal(new Set(labels.slice(1)).size, 4);
});
