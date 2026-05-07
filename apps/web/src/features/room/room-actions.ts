import type { JoinRoomResponse, QualityPreset, RequestedMedia } from "@lowtime/shared";

import { buildPreviewConstraints } from "../../device-preview.js";

export async function joinRoomRequest(input: {
  apiBaseUrl: string;
  displayName: string;
  qualityPreset: QualityPreset;
  requestedMedia: RequestedMedia;
  slug: string;
}): Promise<JoinRoomResponse> {
  const response = await fetch(`${input.apiBaseUrl}/api/rooms/${input.slug}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: input.displayName,
      qualityPreset: input.qualityPreset,
      requestedMedia: input.requestedMedia,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Unable to join room");
  }

  return (await response.json()) as JoinRoomResponse;
}

export async function startPreviewRequest(requestedMedia: RequestedMedia): Promise<MediaStream> {
  if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia == null) {
    throw new Error("This browser does not support live device preview.");
  }

  return navigator.mediaDevices.getUserMedia(buildPreviewConstraints(requestedMedia));
}

export async function submitLobbyAction(input: {
  action: "approve" | "deny";
  apiBaseUrl: string;
  hostSecret: string;
  requestId: string;
  slug: string;
}) {
  const response = await fetch(`${input.apiBaseUrl}/api/rooms/${input.slug}/lobby/${input.requestId}/${input.action}`, {
    method: "POST",
    headers: {
      "x-host-secret": input.hostSecret,
    },
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? `Unable to ${input.action} lobby request`);
  }
}
