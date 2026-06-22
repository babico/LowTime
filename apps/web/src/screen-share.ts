/**
 * Screen share support helpers.
 *
 * The LiveKit client surfaces a screen share as a second video publication on
 * the local participant. Its track source is one of several string values
 * depending on the LiveKit version, so this module is the single place that
 * knows the supported variants.
 */

export interface ScreenShareRoomLike {
  localParticipant: {
    setScreenShareEnabled(next: boolean): Promise<void>;
  };
}

export type ScreenShareToggleResult =
  | { ok: true }
  | { ok: false; message: string };

const SCREEN_SHARE_SOURCES = new Set([
  "screen_share",
  "screenShare",
  "screen-share",
  "screen_video",
]);

export function isScreenShareSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const mediaDevices = (navigator as { mediaDevices?: { getDisplayMedia?: unknown } }).mediaDevices;
  return typeof mediaDevices?.getDisplayMedia === "function";
}

export function isScreenShareTrackSource(source: string | undefined): boolean {
  if (source == null || source === "") {
    return false;
  }

  return SCREEN_SHARE_SOURCES.has(source);
}

export function hasActiveScreenShare(participant: { trackPublications: Map<string, { track?: { kind?: string; isMuted?: boolean; source?: string } | null }> } | null | undefined): boolean {
  if (participant == null) {
    return false;
  }

  for (const publication of participant.trackPublications.values()) {
    const track = publication.track;

    if (track == null || track.kind !== "video" || track.isMuted === true) {
      continue;
    }

    if (isScreenShareTrackSource(track.source)) {
      return true;
    }
  }

  return false;
}

export interface RequestScreenShareToggleInput {
  room: ScreenShareRoomLike | null;
  nextValue: boolean;
  onError?: (message: string) => void;
}

export async function requestScreenShareToggle(
  input: RequestScreenShareToggleInput,
): Promise<ScreenShareToggleResult> {
  if (input.room == null) {
    const message = "Screen share is unavailable because the call is not connected.";
    input.onError?.(message);
    return { ok: false, message };
  }

  try {
    await input.room.localParticipant.setScreenShareEnabled(input.nextValue);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update screen share state";
    input.onError?.(message);
    return { ok: false, message };
  }
}
