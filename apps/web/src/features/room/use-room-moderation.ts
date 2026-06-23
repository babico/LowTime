import { removeParticipantRequest } from "../../host-actions.js";

/**
 * Pre-call moderation actions for the room page (Issue #99).
 *
 * Wraps the existing `removeParticipantRequest` helper from #27
 * with the room's API base URL, slug, and host secret so the
 * room page does not have to thread those props through every
 * call site. The pure shape makes the action testable with an
 * injected fetcher; the room page wraps it in a useState
 * machine for the loading and error UI.
 */

export interface RoomModerationInput {
  apiBaseUrl: string;
  slug: string;
  hostSecret: string;
  fetcher?: typeof fetch;
}

export interface RemoveParticipantInput {
  sessionId: string;
}

export type RoomModerationResult =
  | { ok: true; removedSessionId: string }
  | { ok: false; message: string };

export interface RoomModeration {
  removeParticipant(input: RemoveParticipantInput): Promise<RoomModerationResult>;
  isHostSecretMissing(): boolean;
}

export function buildRoomModeration(input: RoomModerationInput): RoomModeration {
  return {
    isHostSecretMissing() {
      return input.hostSecret.trim() === "";
    },
    async removeParticipant(removeInput: RemoveParticipantInput): Promise<RoomModerationResult> {
      if (input.hostSecret.trim() === "") {
        return { ok: false, message: "Host secret is required to remove a participant." };
      }

      const result = await removeParticipantRequest({
        apiBaseUrl: input.apiBaseUrl,
        slug: input.slug,
        sessionId: removeInput.sessionId,
        hostSecret: input.hostSecret,
        fetcher: input.fetcher,
      });

      if (result.ok) {
        return { ok: true, removedSessionId: result.removedSessionId };
      }
      return { ok: false, message: result.message };
    },
  };
}
