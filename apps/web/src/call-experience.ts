export interface VideoTrackLike {
  kind: string;
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
    if (publication.track?.kind === "video") {
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
