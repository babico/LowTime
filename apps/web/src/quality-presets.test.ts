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
