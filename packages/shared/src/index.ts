export type RoomSlug = string;

export type AccessMode = "open" | "lobby" | "passcode";

export interface RoomSummary {
  slug: RoomSlug;
  accessMode: AccessMode;
  maxParticipants: number;
}

