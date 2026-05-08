import assert from "node:assert/strict";
import test from "node:test";

import { resolutionCapToPixels, type ResolutionCap } from "./index.js";

test("resolutionCapToPixels returns the documented pixel dimensions for every tier", () => {
  const expected: Record<ResolutionCap, { width: number; height: number }> = {
    "240p": { width: 320, height: 240 },
    "360p": { width: 640, height: 360 },
    "480p": { width: 854, height: 480 },
    "720p": { width: 1280, height: 720 },
  };

  for (const [cap, dims] of Object.entries(expected) as Array<[
    ResolutionCap,
    { width: number; height: number },
  ]>) {
    assert.deepEqual(resolutionCapToPixels(cap), dims);
  }
});

test("resolutionCapToPixels is idempotent when round-tripped through the map", () => {
  const caps: ResolutionCap[] = ["240p", "360p", "480p", "720p"];
  for (const cap of caps) {
    const first = resolutionCapToPixels(cap);
    const second = resolutionCapToPixels(cap);
    assert.deepEqual(first, second);
  }
});

test("resolutionCapToPixels produces strictly increasing pixel counts", () => {
  const caps: ResolutionCap[] = ["240p", "360p", "480p", "720p"];
  let previousPixels = 0;
  for (const cap of caps) {
    const { width, height } = resolutionCapToPixels(cap);
    const pixels = width * height;
    assert.ok(pixels > previousPixels);
    previousPixels = pixels;
  }
});
