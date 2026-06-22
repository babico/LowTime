import { hasValidHostSecret } from "../server-support.js";
import type { StoredRoom, StoredSession } from "./room-store.js";

/**
 * Failure reasons a host can hit when trying to remove a participant.
 *
 * - `invalid_host_secret` — the host did not present a valid `x-host-secret`.
 * - `target_not_found` — the target sessionId is not currently in the room.
 * - `cannot_remove_host` — the only remaining session is the host itself.
 */
export type RemoveParticipantFailureReason =
  | "invalid_host_secret"
  | "target_not_found"
  | "cannot_remove_host";

export type RemoveParticipantResult =
  | { ok: true; removed: StoredSession }
  | { ok: false; reason: RemoveParticipantFailureReason };

export interface AttemptRemoveParticipantInput {
  room: StoredRoom;
  hostSecret: string | undefined;
  targetSessionId: string;
  now: Date;
}

/**
 * Pure domain helper: validate host auth, look up the target session, refuse
 * to remove the only remaining host, and then splice the session out of the
 * room. Mutates `room.sessions` and `room.lastActivityAt` in place; does not
 * publish to the signal bus (caller is responsible).
 */
export function attemptRemoveParticipant(
  input: AttemptRemoveParticipantInput,
): RemoveParticipantResult {
  if (!hasValidHostSecret(input.room, input.hostSecret)) {
    return { ok: false, reason: "invalid_host_secret" };
  }

  const target = input.room.sessions.find((session) => session.id === input.targetSessionId);
  if (target == null) {
    return { ok: false, reason: "target_not_found" };
  }

  if (input.room.sessions.length <= 1) {
    return { ok: false, reason: "cannot_remove_host" };
  }

  const idx = input.room.sessions.findIndex((session) => session.id === input.targetSessionId);
  const [removed] = input.room.sessions.splice(idx, 1);
  input.room.lastActivityAt = input.now.toISOString();

  return { ok: true, removed };
}
