import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPreviewConstraints,
  getPreviewStateMessage,
  getQualityPresetLabel,
} from "./device-preview.js";

test("buildPreviewConstraints disables camera constraints when video is off", () => {
  assert.deepEqual(buildPreviewConstraints({ audio: true, video: false }), {
    audio: true,
    video: false,
  });
});

test("buildPreviewConstraints returns conservative mobile-friendly video defaults", () => {
  assert.deepEqual(buildPreviewConstraints({ audio: true, video: true }), {
    audio: true,
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 360, max: 720 },
      frameRate: { ideal: 15, max: 24 },
      facingMode: "user",
    },
  });
});

test("getQualityPresetLabel maps presets to readable names", () => {
  assert.equal(getQualityPresetLabel("data_saver"), "Data Saver");
  assert.equal(getQualityPresetLabel("balanced"), "Balanced");
  assert.equal(getQualityPresetLabel("best_quality"), "Best Quality");
});

test("getPreviewStateMessage prefers explicit errors and covers preview states", () => {
  assert.equal(
    getPreviewStateMessage("idle", null),
    "Start a device preview to check your camera and microphone before joining.",
  );
  assert.equal(
    getPreviewStateMessage("ready", null),
    "Preview is ready. Review your camera and mic choices before joining.",
  );
  assert.equal(
    getPreviewStateMessage("blocked", null),
    "Camera or microphone access is blocked. You can still join with your current media settings.",
  );
  assert.equal(
    getPreviewStateMessage("error", "Camera missing"),
    "Camera missing",
  );
});


test("buildPreviewConstraints returns data_saver profile when preset is data_saver", () => {
  const constraints = buildPreviewConstraints({ audio: true, video: true }, "data_saver");
  assert.ok(typeof constraints.video === "object");
  if (typeof constraints.video === "object") {
    const width = constraints.video.width as { ideal: number };
    const height = constraints.video.height as { ideal: number };
    const frameRate = constraints.video.frameRate as { ideal: number };
    assert.equal(width.ideal, 320);
    assert.equal(height.ideal, 240);
    assert.equal(frameRate.ideal, 12);
  }
});

test("buildPreviewConstraints returns balanced profile when preset is omitted (default)", () => {
  const constraints = buildPreviewConstraints({ audio: true, video: true });
  assert.ok(typeof constraints.video === "object");
  if (typeof constraints.video === "object") {
    const width = constraints.video.width as { ideal: number };
    const height = constraints.video.height as { ideal: number };
    const frameRate = constraints.video.frameRate as { ideal: number };
    assert.equal(width.ideal, 640);
    assert.equal(height.ideal, 360);
    assert.equal(frameRate.ideal, 15);
  }
});

test("buildPreviewConstraints returns best_quality profile when preset is best_quality", () => {
  const constraints = buildPreviewConstraints({ audio: true, video: true }, "best_quality");
  assert.ok(typeof constraints.video === "object");
  if (typeof constraints.video === "object") {
    const width = constraints.video.width as { ideal: number };
    const height = constraints.video.height as { ideal: number };
    const frameRate = constraints.video.frameRate as { ideal: number };
    assert.equal(width.ideal, 1280);
    assert.equal(height.ideal, 720);
    assert.equal(frameRate.ideal, 24);
  }
});

test("buildPreviewConstraints still returns video:false when video is disabled regardless of preset", () => {
  for (const preset of ["data_saver", "balanced", "best_quality"] as const) {
    assert.deepEqual(buildPreviewConstraints({ audio: true, video: false }, preset), {
      audio: true,
      video: false,
    });
  }
});
