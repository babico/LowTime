/**
 * Remote video subscription toggle.
 *
 * The "Pause incoming video" control unsubscribes the local participant from
 * every remote video track (so the SFU stops sending video RTP) and
 * resubscribes when the user resumes. Audio is never affected. Pure helper
 * so it can be unit-tested with a plain-object mock of the LiveKit Room.
 */

export interface RemoteVideoPublicationLike {
  trackSid?: string;
  kind?: "video" | "audio" | string;
}

export interface RemoteVideoParticipantLike {
  trackPublications: Map<string, RemoteVideoPublicationLike>;
}

export interface RemoteVideoRoomLike {
  localParticipant: {
    setSubscribed?: (trackSid: string, subscribed: boolean) => Promise<void>;
  };
  remoteParticipants: Map<string, RemoteVideoParticipantLike> | Iterable<[string, RemoteVideoParticipantLike]>;
}

export type RemoteVideoToggleResult =
  | { ok: true; changedTracks: number }
  | { ok: false; message: string; changedTracks: number };

export interface SetRemoteVideoSubscriptionInput {
  room: RemoteVideoRoomLike | null;
  subscribed: boolean;
  onError?: (message: string) => void;
}

function isRemoteVideoPublication(publication: RemoteVideoPublicationLike | undefined): boolean {
  if (publication == null) {
    return false;
  }

  const sid = publication.trackSid;
  return typeof sid === "string" && sid !== "" && publication.kind === "video";
}

function asRemoteParticipantMap(
  value: RemoteVideoRoomLike["remoteParticipants"],
): Map<string, RemoteVideoParticipantLike> {
  if (value instanceof Map) {
    return value;
  }

  return new Map(value);
}

export async function setRemoteVideoSubscription(
  input: SetRemoteVideoSubscriptionInput,
): Promise<RemoteVideoToggleResult> {
  if (input.room == null) {
    const message = "Pause video is unavailable because the call is not connected.";
    input.onError?.(message);
    return { ok: false, message, changedTracks: 0 };
  }

  if (typeof input.room.localParticipant.setSubscribed !== "function") {
    const message = "This call transport does not support pausing remote video.";
    input.onError?.(message);
    return { ok: false, message, changedTracks: 0 };
  }

  const participants = asRemoteParticipantMap(input.room.remoteParticipants);
  const targetSids: string[] = [];

  for (const participant of participants.values()) {
    if (participant == null || participant.trackPublications == null) {
      continue;
    }

    for (const publication of participant.trackPublications.values()) {
      if (isRemoteVideoPublication(publication)) {
        targetSids.push(publication.trackSid as string);
      }
    }
  }

  let changedTracks = 0;
  let firstError: string | null = null;

  for (const trackSid of targetSids) {
    try {
      await input.room.localParticipant.setSubscribed(trackSid, input.subscribed);
      changedTracks += 1;
    } catch (error) {
      if (firstError == null) {
        firstError = error instanceof Error ? error.message : "Unable to update remote video subscription";
        input.onError?.(firstError);
      }
    }
  }

  if (firstError != null) {
    return { ok: false, message: firstError, changedTracks };
  }

  return { ok: true, changedTracks };
}
