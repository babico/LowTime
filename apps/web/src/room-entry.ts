import type { QualityPreset, RequestedMedia } from "@lowtime/shared";

export type ViewState =
  | { kind: "home" }
  | { kind: "room"; slug: string };

export interface QualityPresetOption {
  value: QualityPreset;
  label: string;
  description: string;
}

export const QUALITY_PRESET_OPTIONS: QualityPresetOption[] = [
  {
    value: "data_saver",
    label: "Data Saver",
    description: "Lowest bandwidth usage for weak networks.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Default mix of quality and resilience.",
  },
  {
    value: "best_quality",
    label: "Best Quality",
    description: "Highest quality when the network can handle it.",
  },
];

export function getViewState(pathname: string): ViewState {
  const roomMatch = pathname.match(/^\/r\/([A-Za-z0-9]+)$/);

  if (roomMatch == null) {
    return { kind: "home" };
  }

  return {
    kind: "room",
    slug: roomMatch[1],
  };
}

export function getApiBaseUrl(
  configuredBaseUrl: string | undefined,
  location: { protocol: string; hostname: string },
): string {
  if (configuredBaseUrl != null && configuredBaseUrl.trim() !== "") {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const protocol = location.protocol === "https:" ? "https:" : "http:";
  const hostname = location.hostname || "localhost";
  return `${protocol}//${hostname}:3000`;
}

export function buildRequestedMedia(audioEnabled: boolean, videoEnabled: boolean): RequestedMedia {
  return {
    audio: audioEnabled,
    video: videoEnabled,
  };
}
