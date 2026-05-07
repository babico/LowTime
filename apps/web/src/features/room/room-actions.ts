import type { JoinRoomResponse, QualityPreset, ReclaimRoomResponse, RequestedMedia } from "@lowtime/shared";

import { buildPreviewConstraints } from "../../device-preview.js";

export async function joinRoomRequest(input: {
  apiBaseUrl: string;
  displayName: string;
  passcode?: string;
  qualityPreset: QualityPreset;
  requestedMedia: RequestedMedia;
  slug: string;
}): Promise<JoinRoomResponse> {
  const body: Record<string, unknown> = {
    displayName: input.displayName,
    qualityPreset: input.qualityPreset,
    requestedMedia: input.requestedMedia,
  };

  if (input.passcode != null && input.passcode.length > 0) {
    body.passcode = input.passcode;
  }

  const response = await fetch(`${input.apiBaseUrl}/api/rooms/${input.slug}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

export type ReclaimOutcome =
  | { kind: "ok"; response: ReclaimRoomResponse }
  | { kind: "unauthorized" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

/**
 * Validates a stored or freshly pasted host secret against the server's
 * reclaim endpoint. Returns a discriminated union so callers can map server
 * responses to UI state without leaking raw HTTP status codes.
 */
export async function reclaimHostRole(input: {
  apiBaseUrl: string;
  hostSecret: string;
  slug: string;
  signal?: AbortSignal;
}): Promise<ReclaimOutcome> {
  let response: Response;
  try {
    response = await fetch(`${input.apiBaseUrl}/api/rooms/${input.slug}/reclaim`, {
      method: "POST",
      headers: {
        "x-host-secret": input.hostSecret,
      },
      signal: input.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reclaim host role";
    return { kind: "error", message };
  }

  if (response.ok) {
    const payload = (await response.json()) as ReclaimRoomResponse;
    return { kind: "ok", response: payload };
  }

  if (response.status === 403) {
    return { kind: "unauthorized" };
  }

  if (response.status === 409) {
    return { kind: "unavailable" };
  }

  let message = "Unable to reclaim host role";
  try {
    const payload = (await response.json()) as { message?: string };
    if (typeof payload.message === "string" && payload.message.length > 0) {
      message = payload.message;
    }
  } catch {
    // Leave the default message when the body cannot be parsed.
  }
  return { kind: "error", message };
}
