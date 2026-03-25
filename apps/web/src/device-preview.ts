import type { QualityPreset, RequestedMedia } from "@lowtime/shared";

export type PreviewState = "idle" | "requesting" | "ready" | "blocked" | "error";

export function buildPreviewConstraints(requestedMedia: RequestedMedia): MediaStreamConstraints {
  return {
    audio: requestedMedia.audio,
    video: requestedMedia.video
      ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          frameRate: { ideal: 15, max: 24 },
          facingMode: "user",
        }
      : false,
  };
}

export function getQualityPresetLabel(qualityPreset: QualityPreset): string {
  switch (qualityPreset) {
    case "data_saver":
      return "Data Saver";
    case "best_quality":
      return "Best Quality";
    default:
      return "Balanced";
  }
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
