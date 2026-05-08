import type { QualityPreset } from "@lowtime/shared";

export interface PresetProfile {
  label: string;
  maxResolution: { width: number; height: number };
  maxFps: number;
  /** Video bitrate cap in **kilobits per second**. Multiply by 1000 for LiveKit. */
  maxVideoBitrateKbps: number;
}

// Source of truth for every place the web client renders or applies a
// quality preset. Keep docs/04-media-and-quality.md in sync with these values.
const PRESET_PROFILES: Record<QualityPreset, PresetProfile> = {
  data_saver: {
    label: "Data Saver",
    maxResolution: { width: 320, height: 240 },
    maxFps: 12,
    maxVideoBitrateKbps: 200,
  },
  balanced: {
    label: "Balanced",
    maxResolution: { width: 640, height: 360 },
    maxFps: 15,
    maxVideoBitrateKbps: 500,
  },
  best_quality: {
    label: "Best Quality",
    maxResolution: { width: 1280, height: 720 },
    maxFps: 24,
    maxVideoBitrateKbps: 1200,
  },
};

export function getPresetProfile(preset: QualityPreset): PresetProfile {
  return PRESET_PROFILES[preset];
}

export function listPresetProfiles(): Array<{ preset: QualityPreset; profile: PresetProfile }> {
  return (Object.keys(PRESET_PROFILES) as QualityPreset[]).map((preset) => ({
    preset,
    profile: PRESET_PROFILES[preset],
  }));
}

import {
  clampPresetToCap,
  resolutionCapToPixels,
  type AdvancedMediaPrefs,
  type QualityCap,
} from "@lowtime/shared";

/**
 * The reduced, LiveKit-shaped output of combining a `QualityPreset`, a
 * `QualityCap`, and any per-user `AdvancedMediaPrefs` into the final publish
 * parameters. The web client's `connectToSfu` consumes this shape directly.
 */
export interface EffectivePublishOptions {
  resolution: { width: number; height: number; frameRate: number };
  maxBitrateKbps: number;
  audioOnly: boolean;
  audioPriority: boolean;
  receiveVideo: boolean;
}

export interface ComputeEffectivePublishOptionsInput {
  preset: QualityPreset;
  cap: QualityCap;
  advanced?: AdvancedMediaPrefs;
}

/**
 * Combines a preset profile, the host-imposed cap, and the user's advanced
 * prefs into the final `EffectivePublishOptions`. Overrides only ever tighten
 * the preset baseline; a user cannot raise the limits above what the preset
 * and cap allow.
 */
export function computeEffectivePublishOptions(
  input: ComputeEffectivePublishOptionsInput,
): EffectivePublishOptions {
  const preset = clampPresetToCap(input.preset, input.cap);
  const profile = getPresetProfile(preset);
  const advanced = input.advanced ?? {};

  const presetPixels = profile.maxResolution.width * profile.maxResolution.height;
  const userPixels =
    advanced.maxResolution != null
      ? resolutionCapToPixels(advanced.maxResolution).width *
        resolutionCapToPixels(advanced.maxResolution).height
      : Number.POSITIVE_INFINITY;

  // Pick the tighter resolution: user-chosen tier if strictly smaller, else
  // preset resolution. Equal resolutions defer to the preset for stability.
  const resolutionSource =
    advanced.maxResolution != null && userPixels < presetPixels
      ? resolutionCapToPixels(advanced.maxResolution)
      : profile.maxResolution;

  const frameRate =
    advanced.maxFps != null && advanced.maxFps > 0 && advanced.maxFps < profile.maxFps
      ? advanced.maxFps
      : profile.maxFps;

  const maxBitrateKbps =
    advanced.maxBitrateKbps != null &&
    advanced.maxBitrateKbps > 0 &&
    advanced.maxBitrateKbps < profile.maxVideoBitrateKbps
      ? advanced.maxBitrateKbps
      : profile.maxVideoBitrateKbps;

  return {
    resolution: {
      width: resolutionSource.width,
      height: resolutionSource.height,
      frameRate,
    },
    maxBitrateKbps,
    audioOnly: advanced.audioOnly === true,
    audioPriority: advanced.audioPriority === true,
    receiveVideo: advanced.receiveVideo !== false,
  };
}
