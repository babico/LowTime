export interface VideoTrackLike {
  kind: string;
  isMuted?: boolean;
  /**
   * LiveKit track source identifier (`"camera"`, `"screen_share"`, …).
   * Optional so non-LiveKit test mocks can omit it; production code always
   * populates it via the `trackPublished` / `localTrackPublished` event payload.
   */
  source?: string;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement[];
}

export interface TrackPublicationLike {
  track?: VideoTrackLike | null;
}

export interface ParticipantLike {
  identity: string;
  name?: string;
  trackPublications: Map<string, TrackPublicationLike>;
}

export function getPrimaryParticipant(participants: Iterable<unknown>): ParticipantLike | null {
  for (const participant of participants) {
    if (isParticipantLike(participant)) {
      return participant;
    }
  }

  return null;
}

export function getParticipant(value: unknown): ParticipantLike | null {
  return isParticipantLike(value) ? value : null;
}

export function getParticipantLabel(participant: Pick<ParticipantLike, "identity" | "name"> | null, fallback: string) {
  if (participant == null) {
    return fallback;
  }

  const trimmedName = participant.name?.trim();

  if (trimmedName != null && trimmedName !== "") {
    return trimmedName;
  }

  return participant.identity;
}

export function getFirstVideoTrack(participant: ParticipantLike | null): VideoTrackLike | null {
  if (participant == null) {
    return null;
  }

  for (const publication of participant.trackPublications.values()) {
    if (publication.track?.kind === "video" && publication.track.isMuted !== true) {
      return publication.track;
    }
  }

  return null;
}

const SCREEN_SHARE_SOURCES = new Set([
  "screen_share",
  "screenShare",
  "screen-share",
  "screen_video",
]);

/**
 * Returns the local participant's active screen share video track, or
 * `null` when no screen share is published. Mirrors `getFirstVideoTrack`
 * but filters on the track source so camera and screen share stay
 * distinguishable in the call UI.
 */
export function getActiveScreenShareTrack(participant: ParticipantLike | null): VideoTrackLike | null {
  if (participant == null) {
    return null;
  }

  for (const publication of participant.trackPublications.values()) {
    const track = publication.track;

    if (track == null) {
      continue;
    }

    if (track.kind !== "video" || track.isMuted === true) {
      continue;
    }

    if (track.source != null && SCREEN_SHARE_SOURCES.has(track.source)) {
      return track;
    }
  }

  return null;
}

/**
 * Returns the track the self-tile should render: the active screen share
 * when present (and not muted), otherwise the camera, otherwise `null`.
 */
export function pickPrimaryVideoTrack(participant: ParticipantLike | null): VideoTrackLike | null {
  const screenShare = getActiveScreenShareTrack(participant);

  if (screenShare != null) {
    return screenShare;
  }

  return getFirstVideoTrack(participant);
}

function isParticipantLike(value: unknown): value is ParticipantLike {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Partial<ParticipantLike>;
  return typeof candidate.identity === "string" && candidate.trackPublications instanceof Map;
}
