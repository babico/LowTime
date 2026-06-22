export interface VideoTrackLike {
  kind: string;
  isMuted?: boolean;
  /**
   * LiveKit track source identifier (`"camera"`, `"screen_share"`, …).
   * Optional so non-LiveKit test mocks can omit it; production code
   * populates it via the `trackPublished` / `localTrackPublished`
   * event payload.
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

function isParticipantLike(value: unknown): value is ParticipantLike {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Partial<ParticipantLike>;
  return typeof candidate.identity === "string" && candidate.trackPublications instanceof Map;
}

/**
 * Returns every participant in the iterable that publishes at least one
 * attached (non-muted) video track. Audio-only and muted-video
 * participants are dropped. Order is preserved.
 *
 * Used by the call page to render one tile per remote participant in
 * group rooms (Issue #29).
 */
export function getAllVideoParticipants(
  participants: Iterable<unknown>,
): ParticipantLike[] {
  const result: ParticipantLike[] = [];

  for (const candidate of participants) {
    if (!isParticipantLike(candidate)) {
      continue;
    }

    const hasVideo = Array.from(candidate.trackPublications.values()).some((publication) => {
      const track = publication.track;
      return track != null && track.kind === "video" && track.isMuted !== true;
    });

    if (hasVideo) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Returns the first attached track on a participant whose `source`
 * matches the requested value, or `null` when no matching track is
 * published or the only matching track is muted.
 */
export function getParticipantVideoTrack(
  participant: ParticipantLike | null,
  source: string,
): VideoTrackLike | null {
  if (participant == null) {
    return null;
  }

  for (const publication of participant.trackPublications.values()) {
    const track = publication.track;

    if (track == null || track.kind !== "video" || track.isMuted === true) {
      continue;
    }

    if (track.source === source) {
      return track;
    }
  }

  return null;
}
