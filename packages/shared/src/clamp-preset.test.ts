import assert from "node:assert/strict";
import test from "node:test";

import { clampPresetToCap, type QualityCap, type QualityPreset } from "./index.js";

const PRESETS: QualityPreset[] = ["data_saver", "balanced", "best_quality"];
const CAPS: QualityCap[] = ["low", "balanced", "high"];

test("clampPresetToCap returns data_saver only when cap is low", () => {
  for (const preset of PRESETS) {
    assert.equal(clampPresetToCap(preset, "low"), "data_saver");
  }
});

test("clampPresetToCap under cap=balanced keeps data_saver and balanced, clamps best_quality", () => {
  assert.equal(clampPresetToCap("data_saver", "balanced"), "data_saver");
  assert.equal(clampPresetToCap("balanced", "balanced"), "balanced");
  assert.equal(clampPresetToCap("best_quality", "balanced"), "balanced");
});

test("clampPresetToCap under cap=high is a no-op for every preset", () => {
  for (const preset of PRESETS) {
    assert.equal(clampPresetToCap(preset, "high"), preset);
  }
});

test("clampPresetToCap is idempotent for every (preset, cap) pair", () => {
  for (const preset of PRESETS) {
    for (const cap of CAPS) {
      const clamped = clampPresetToCap(preset, cap);
      const doubleClamped = clampPresetToCap(clamped, cap);
      assert.equal(doubleClamped, clamped);
    }
  }
});

test("clampPresetToCap result is always in the set of presets the cap allows", () => {
  const allowedByCap: Record<QualityCap, QualityPreset[]> = {
    low: ["data_saver"],
    balanced: ["data_saver", "balanced"],
    high: ["data_saver", "balanced", "best_quality"],
  };
  for (const preset of PRESETS) {
    for (const cap of CAPS) {
      const result = clampPresetToCap(preset, cap);
      assert.ok(
        allowedByCap[cap].includes(result),
        `cap=${cap} preset=${preset} → ${result} should be in ${allowedByCap[cap].join(",")}`,
      );
    }
  }
});
