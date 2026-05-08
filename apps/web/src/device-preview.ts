import type { QualityPreset, RequestedMedia } from "@lowtime/shared";

import { getPresetProfile } from "./quality-presets.js";

export type PreviewState = "idle" | "requesting" | "ready" | "blocked" | "error";

const DEFAULT_PRESET: QualityPreset = "balanced";

export function buildPreviewConstraints(
  requestedMedia: RequestedMedia,
  preset: QualityPreset = DEFAULT_PRESET,
): MediaStreamConstraints {
  if (!requestedMedia.video) {
    return {
      audio: requestedMedia.audio,
      video: false,
    };
  }

  const profile = getPresetProfile(preset);
  return {
    audio: requestedMedia.audio,
    video: {
      width: {
        ideal: profile.maxResolution.width,
        max: Math.max(profile.maxResolution.width, 1280),
      },
      height: {
        ideal: profile.maxResolution.height,
        max: Math.max(profile.maxResolution.height, 720),
      },
      frameRate: {
        ideal: profile.maxFps,
        max: Math.max(profile.maxFps, 24),
      },
      facingMode: "user",
    },
  };
}

export function getQualityPresetLabel(qualityPreset: QualityPreset): string {
  return getPresetProfile(qualityPreset).label;
}

export function getPreviewStateMessage(previewState: PreviewState, previewError: string | null): string {
  if (previewError != null && previewError.trim() !== "") {
    return previewError;
  }

  switch (previewState) {
    case "requesting":
      return "Requesting camera and microphone access...";
    case "ready":
      return "Preview is ready. Review your camera and mic choices before joining.";
    case "blocked":
      return "Camera or microphone access is blocked. You can still join with your current media settings.";
    case "error":
      return "Preview could not start. Check your browser permissions or device availability.";
    default:
      return "Start a device preview to check your camera and microphone before joining.";
  }
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}
