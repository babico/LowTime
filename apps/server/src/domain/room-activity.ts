import { getRoomStatus } from "./room-status.js";
import { ROOM_TTL_MS, type RoomStore } from "./room-store.js";

/**
 * Returns the ISO-8601 timestamp that represents `lastActivityAt + ROOM_TTL_MS`.
 * Separated from the mutating helper so tests can exercise the calculation
 * without constructing a store.
 */
export function computeExpiryFrom(lastActivityAt: string): string {
  return new Date(Date.parse(lastActivityAt) + ROOM_TTL_MS).toISOString();
}

/**
 * Bumps the room's `lastActivityAt` to `now` and recomputes `expiresAt` as
 * `lastActivityAt + ROOM_TTL_MS`. No-op when the slug is unknown, when the
 * computed status is already `"expired"`, or when the stored status is
 * `"closed"`. Never throws.
 *
 * Called by every sanctioned write path (direct admission, lobby approve,
 * settings update / passcode rotation). See
 * `.kiro/specs/room-expiry-and-cleanup/requirements.md` Requirement 2 for the
 * exhaustive list of call sites and their negative clauses.
 */
export function recordRoomActivity(store: RoomStore, slug: string, now: Date): void {
  const room = store.getRoom(slug);
  if (room == null) {
    return;
  }

  if (room.status === "closed") {
    return;
  }

  if (getRoomStatus(room, now) === "expired") {
    return;
  }

  const lastActivityAt = now.toISOString();
  const expiresAt = computeExpiryFrom(lastActivityAt);
  store.setRoomActivity(slug, lastActivityAt, expiresAt);
}

export { ROOM_TTL_MS };
