import type { RoomSummary } from "@lowtime/shared";

import type { StoredRoom } from "../server-support.js";

export function toRoomSummary(room: StoredRoom, now = new Date()): RoomSummary {
  return {
    slug: room.slug,
    accessMode: room.accessMode,
    maxParticipants: room.maxParticipants,
    qualityCap: room.qualityCap,
    allowScreenShare: room.allowScreenShare,
    status: getRoomStatus(room, now),
    expiresAt: room.expiresAt,
  };
}

export function getRoomStatus(room: StoredRoom, now: Date): RoomSummary["status"] {
  if (room.status === "closed") {
    return "closed";
  }

  if (new Date(room.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }

  return room.status;
}
