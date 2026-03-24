export type RoomSlug = string;

export type AccessMode = "open" | "lobby" | "passcode";

export type QualityCap = "low" | "balanced" | "high";

export type RoomStatus = "created" | "active" | "expiring" | "expired" | "closed";

export interface RoomSummary {
  slug: RoomSlug;
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  status: RoomStatus;
  expiresAt: string;
}

export interface CreateRoomRequest {
  accessMode?: AccessMode;
  maxParticipants?: number;
  qualityCap?: QualityCap;
  allowScreenShare?: boolean;
}

export interface CreateRoomResponse {
  roomSlug: RoomSlug;
  joinUrl: string;
  hostSecret: string;
  expiresAt: string;
  room: RoomSummary;
}
