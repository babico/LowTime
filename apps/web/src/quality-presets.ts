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
