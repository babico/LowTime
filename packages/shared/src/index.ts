export type RoomSlug = string;

export type AccessMode = "open" | "lobby" | "passcode";

export type QualityCap = "low" | "balanced" | "high";

export type QualityPreset = "data_saver" | "balanced" | "best_quality";

export type RoomStatus = "created" | "active" | "expiring" | "expired" | "closed";

export type TransportPreference = "sfu" | "p2p";

export type JoinState = "direct" | "waiting" | "denied";

export type JoinDeniedReason = "room_full" | "room_expired" | "passcode_required" | "invalid_passcode";

export interface RoomSummary {
  slug: RoomSlug;
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  status: RoomStatus;
  expiresAt: string;
}

export interface RequestedMedia {
  audio: boolean;
  video: boolean;
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

export interface JoinRoomRequest {
  displayName: string;
  passcode?: string;
  qualityPreset?: QualityPreset;
  requestedMedia?: RequestedMedia;
}

export interface JoinRoomDirectResponse {
  joinState: "direct";
  sessionId: string;
  transportPreference: TransportPreference;
}

export interface JoinRoomWaitingResponse {
  joinState: "waiting";
  requestId: string;
}

export interface JoinRoomDeniedResponse {
  joinState: "denied";
  reason: JoinDeniedReason;
}

export type JoinRoomResponse =
  | JoinRoomDirectResponse
  | JoinRoomWaitingResponse
  | JoinRoomDeniedResponse;

export interface MediaTokenRequest {
  sessionId: string;
  transportPreference?: TransportPreference;
}

export interface SfuTokenResponse {
  transport: "sfu";
  sfuUrl: string;
  token: string;
  roomName: RoomSlug;
  participantIdentity: string;
  participantName: string;
}

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface P2PSessionConfig {
  offerRole: "caller" | "callee";
  iceServers: IceServerConfig[];
}

export interface P2PTokenResponse {
  transport: "p2p";
  p2pSession: P2PSessionConfig;
}

export type MediaTokenResponse = SfuTokenResponse | P2PTokenResponse;
