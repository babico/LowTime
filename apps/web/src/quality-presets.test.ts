import assert from "node:assert/strict";
import test from "node:test";

import type { QualityPreset } from "@lowtime/shared";

import { getPresetProfile, listPresetProfiles } from "./quality-presets.js";

test("getPresetProfile returns a profile with sane values for every preset", () => {
  const presets: QualityPreset[] = ["data_saver", "balanced", "best_quality"];
  for (const preset of presets) {
    const profile = getPresetProfile(preset);
    assert.ok(profile.label.length > 0, `label missing for ${preset}`);
    assert.ok(profile.maxResolution.width > 0);
    assert.ok(profile.maxResolution.height > 0);
    assert.ok(profile.maxFps > 0);
    assert.ok(profile.maxVideoBitrateKbps > 0);
  }
});

test("getPresetProfile returns strictly increasing caps as quality increases", () => {
  const dataSaver = getPresetProfile("data_saver");
  const balanced = getPresetProfile("balanced");
  const bestQuality = getPresetProfile("best_quality");

  assert.ok(dataSaver.maxResolution.width < balanced.maxResolution.width);
  assert.ok(balanced.maxResolution.width < bestQuality.maxResolution.width);

  assert.ok(dataSaver.maxFps <= balanced.maxFps);
  assert.ok(balanced.maxFps <= bestQuality.maxFps);

  assert.ok(dataSaver.maxVideoBitrateKbps < balanced.maxVideoBitrateKbps);
  assert.ok(balanced.maxVideoBitrateKbps < bestQuality.maxVideoBitrateKbps);
});

test("listPresetProfiles lists every preset exactly once in the same order as the union", () => {
  const entries = listPresetProfiles();
  const presetsInOrder = entries.map((entry) => entry.preset);
  assert.deepEqual(presetsInOrder, ["data_saver", "balanced", "best_quality"]);

  // Profiles round-trip through getPresetProfile.
  for (const entry of entries) {
    assert.deepEqual(entry.profile, getPresetProfile(entry.preset));
  }
});

test("getPresetProfile exposes user-facing labels matching the documented presets", () => {
  assert.equal(getPresetProfile("data_saver").label, "Data Saver");
  assert.equal(getPresetProfile("balanced").label, "Balanced");
  assert.equal(getPresetProfile("best_quality").label, "Best Quality");
});


import { computeEffectivePublishOptions } from "./quality-presets.js";

test("computeEffectivePublishOptions without advanced prefs yields preset+cap defaults (Balanced)", () => {
  const result = computeEffectivePublishOptions({ preset: "balanced", cap: "high" });
  assert.equal(result.resolution.width, 640);
  assert.equal(result.resolution.height, 360);
  assert.equal(result.resolution.frameRate, 15);
  assert.equal(result.maxBitrateKbps, 500);
  assert.equal(result.audioOnly, false);
  assert.equal(result.audioPriority, false);
  assert.equal(result.receiveVideo, true);
});

test("computeEffectivePublishOptions clamps preset when the cap is lower than the chosen preset", () => {
  const result = computeEffectivePublishOptions({ preset: "best_quality", cap: "low" });
  // 'low' cap clamps to data_saver profile (320x240 @ 12fps @ 200 kbps).
  assert.equal(result.resolution.width, 320);
  assert.equal(result.resolution.height, 240);
  assert.equal(result.resolution.frameRate, 12);
  assert.equal(result.maxBitrateKbps, 200);
});

test("computeEffectivePublishOptions honors maxBitrateKbps when it tightens the preset", () => {
  const result = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "high",
    advanced: { maxBitrateKbps: 300 },
  });
  // Preset best_quality would allow 1200 kbps, but user asked for 300.
  assert.equal(result.maxBitrateKbps, 300);
});

test("computeEffectivePublishOptions ignores maxBitrateKbps when it would loosen the preset", () => {
  const result = computeEffectivePublishOptions({
    preset: "data_saver",
    cap: "high",
    advanced: { maxBitrateKbps: 5000 },
  });
  // data_saver caps at 200 kbps; user request of 5000 must not take effect.
  assert.equal(result.maxBitrateKbps, 200);
});

test("computeEffectivePublishOptions honors maxFps when it tightens, ignores it when it loosens", () => {
  const tighter = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "high",
    advanced: { maxFps: 10 },
  });
  assert.equal(tighter.resolution.frameRate, 10);

  const looser = computeEffectivePublishOptions({
    preset: "data_saver",
    cap: "high",
    advanced: { maxFps: 60 },
  });
  // data_saver caps at 12 fps; user request of 60 must not take effect.
  assert.equal(looser.resolution.frameRate, 12);
});

test("computeEffectivePublishOptions honors maxResolution when it tightens, ignores it when equal or larger", () => {
  const tighter = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "high",
    advanced: { maxResolution: "360p" },
  });
  assert.equal(tighter.resolution.width, 640);
  assert.equal(tighter.resolution.height, 360);

  const sameSize = computeEffectivePublishOptions({
    preset: "balanced",
    cap: "high",
    advanced: { maxResolution: "360p" },
  });
  // Balanced is 640x360; user-specified 360p matches so no change.
  assert.equal(sameSize.resolution.width, 640);
  assert.equal(sameSize.resolution.height, 360);

  const larger = computeEffectivePublishOptions({
    preset: "data_saver",
    cap: "high",
    advanced: { maxResolution: "720p" },
  });
  // Data Saver is 320x240; user-specified 720p must not take effect.
  assert.equal(larger.resolution.width, 320);
  assert.equal(larger.resolution.height, 240);
});

test("computeEffectivePublishOptions toggles audioOnly, audioPriority, receiveVideo flags", () => {
  const audioOnly = computeEffectivePublishOptions({
    preset: "balanced",
    cap: "high",
    advanced: { audioOnly: true },
  });
  assert.equal(audioOnly.audioOnly, true);

  const priority = computeEffectivePublishOptions({
    preset: "balanced",
    cap: "high",
    advanced: { audioPriority: true },
  });
  assert.equal(priority.audioPriority, true);

  const noReceive = computeEffectivePublishOptions({
    preset: "balanced",
    cap: "high",
    advanced: { receiveVideo: false },
  });
  assert.equal(noReceive.receiveVideo, false);
});

test("computeEffectivePublishOptions combines all overrides at once", () => {
  const result = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "high",
    advanced: {
      maxResolution: "240p",
      maxFps: 8,
      maxBitrateKbps: 100,
      audioPriority: true,
      audioOnly: true,
      receiveVideo: false,
    },
  });
  assert.equal(result.resolution.width, 320);
  assert.equal(result.resolution.height, 240);
  assert.equal(result.resolution.frameRate, 8);
  assert.equal(result.maxBitrateKbps, 100);
  assert.equal(result.audioOnly, true);
  assert.equal(result.audioPriority, true);
  assert.equal(result.receiveVideo, false);
});

test("computeEffectivePublishOptions still clamps to cap before applying advanced prefs", () => {
  // User picked best_quality with maxBitrate 900, but cap is balanced.
  // Cap clamps preset to balanced (500 kbps max), and user-chosen 900 is
  // greater than the clamped preset, so the preset ceiling wins.
  const capOverrules = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "balanced",
    advanced: { maxBitrateKbps: 900 },
  });
  assert.equal(capOverrules.maxBitrateKbps, 500);

  // But if the user asks for 250 kbps, that tightens past the cap-clamped
  // 500, so the user value wins.
  const userOverrules = computeEffectivePublishOptions({
    preset: "best_quality",
    cap: "balanced",
    advanced: { maxBitrateKbps: 250 },
  });
  assert.equal(userOverrules.maxBitrateKbps, 250);
});
