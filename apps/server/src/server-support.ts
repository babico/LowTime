import crypto from "node:crypto";

import type {
  AccessMode,
  CreateRoomRequest,
  JoinRoomRequest,
  MediaTokenRequest,
  QualityCap,
  RoomSlug,
  RoomSummary,
  TransportPreference,
} from "@lowtime/shared";

import { getLiveKitConfig, type LiveKitConfig } from "./livekit.js";

const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_PARTICIPANTS = 2;
const DEFAULT_QUALITY_CAP: QualityCap = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
const DEFAULT_ALLOW_SCREEN_SHARE = true;

const ACCESS_MODES: AccessMode[] = ["open", "lobby", "passcode"];
const QUALITY_CAPS: QualityCap[] = ["low", "balanced", "high"];

export interface StoredRoom extends RoomSummary {
  hostSecret: string;
  sessions: StoredSession[];
  lobbyRequests: StoredLobbyRequest[];
}

export interface CreateStoredRoomInput {
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  expiresAt: string;
}

export interface StoredSession {
  id: string;
  displayName: string;
}

export interface StoredLobbyRequest {
  id: string;
  displayName: string;
  createdAt: string;
  status: "waiting" | "approved" | "denied";
  sessionId?: string;
  transportPreference?: TransportPreference;
  denialReason?: "host_denied" | "room_expired" | "room_closed";
}

export interface RoomStore {
  createRoom(input: CreateStoredRoomInput): StoredRoom;
  getRoom(slug: RoomSlug): StoredRoom | undefined;
  createSession(roomSlug: RoomSlug, displayName: string): StoredSession | undefined;
  createLobbyRequest(roomSlug: RoomSlug, displayName: string, createdAt: string): StoredLobbyRequest | undefined;
  listLobbyRequests(roomSlug: RoomSlug): StoredLobbyRequest[];
  getLobbyRequest(roomSlug: RoomSlug, requestId: string): StoredLobbyRequest | undefined;
  approveLobbyRequest(roomSlug: RoomSlug, requestId: string): StoredLobbyRequest | undefined;
  denyLobbyRequest(roomSlug: RoomSlug, requestId: string, reason: "host_denied" | "room_expired" | "room_closed"): StoredLobbyRequest | undefined;
}

export interface BuildAppOptions {
  now?: () => Date;
  roomStore?: RoomStore;
  liveKitConfig?: LiveKitConfig | null;
}

export interface RouteContext {
  liveKitConfig: LiveKitConfig | null;
  now: () => Date;
  roomStore: RoomStore;
}

export function createRouteContext(options: BuildAppOptions = {}): RouteContext {
  return {
    liveKitConfig: options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig,
    now: options.now ?? (() => new Date()),
    roomStore: options.roomStore ?? createInMemoryRoomStore(),
  };
}

export function createRoomExpiry(now: Date): string {
  return new Date(now.getTime() + DEFAULT_ROOM_TTL_MS).toISOString();
}

export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<RoomSlug, StoredRoom>();

  return {
    createRoom(input) {
      let slug = createSlug();

      while (rooms.has(slug)) {
        slug = createSlug();
      }

      const room: StoredRoom = {
        slug,
        accessMode: input.accessMode,
        maxParticipants: input.maxParticipants,
        qualityCap: input.qualityCap,
        allowScreenShare: input.allowScreenShare,
        status: "created",
        expiresAt: input.expiresAt,
        hostSecret: createHostSecret(),
        sessions: [],
        lobbyRequests: [],
      };

      rooms.set(slug, room);

      return room;
    },
    getRoom(slug) {
      return rooms.get(slug);
    },
    createSession(roomSlug, displayName) {
      const room = rooms.get(roomSlug);

      if (room == null || room.sessions.length >= room.maxParticipants) {
        return undefined;
      }

      const session: StoredSession = {
        id: createSessionId(),
        displayName,
      };

      room.sessions.push(session);

      return session;
    },
    createLobbyRequest(roomSlug, displayName, createdAt) {
      const room = rooms.get(roomSlug);

      if (
        room == null ||
        room.sessions.length + room.lobbyRequests.filter((entry) => entry.status === "waiting").length >= room.maxParticipants
      ) {
        return undefined;
      }

      const request: StoredLobbyRequest = {
        id: createRequestId(),
        displayName,
        createdAt,
        status: "waiting",
      };

      room.lobbyRequests.push(request);
      return request;
    },
    listLobbyRequests(roomSlug) {
      const room = rooms.get(roomSlug);
      if (room == null) {
        return [];
      }

      return room.lobbyRequests.filter((entry) => entry.status === "waiting");
    },
    getLobbyRequest(roomSlug, requestId) {
      return rooms.get(roomSlug)?.lobbyRequests.find((entry) => entry.id === requestId);
    },
    approveLobbyRequest(roomSlug, requestId) {
      const room = rooms.get(roomSlug);
      const request = room?.lobbyRequests.find((entry) => entry.id === requestId);

      if (room == null || request == null || request.status !== "waiting" || room.sessions.length >= room.maxParticipants) {
        return undefined;
      }

      const session = this.createSession(roomSlug, request.displayName);
      if (session == null) {
        return undefined;
      }

      request.status = "approved";
      request.sessionId = session.id;
      request.transportPreference = "sfu";
      return request;
    },
    denyLobbyRequest(roomSlug, requestId, reason) {
      const request = rooms.get(roomSlug)?.lobbyRequests.find((entry) => entry.id === requestId);
      if (request == null) {
        return undefined;
      }

      request.status = "denied";
      request.denialReason = reason;
      return request;
    },
  };
}

export function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}

export function validateCreateRoomRequest(input: CreateRoomRequest): {
  ok: true;
  value: Omit<CreateStoredRoomInput, "expiresAt">;
} | {
  ok: false;
  message: string;
} {
  const accessMode = input.accessMode ?? DEFAULT_ACCESS_MODE;
  const maxParticipants = input.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
  const qualityCap = input.qualityCap ?? DEFAULT_QUALITY_CAP;
  const allowScreenShare = input.allowScreenShare ?? DEFAULT_ALLOW_SCREEN_SHARE;

  if (!ACCESS_MODES.includes(accessMode)) {
    return {
      ok: false,
      message: "accessMode must be one of open, lobby, or passcode",
    };
  }

  if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 4) {
    return {
      ok: false,
      message: "maxParticipants must be an integer between 2 and 4",
    };
  }

  if (!QUALITY_CAPS.includes(qualityCap)) {
    return {
      ok: false,
      message: "qualityCap must be one of low, balanced, or high",
    };
  }

  if (typeof allowScreenShare !== "boolean") {
    return {
      ok: false,
      message: "allowScreenShare must be a boolean",
    };
  }

  return {
    ok: true,
    value: {
      accessMode,
      maxParticipants,
      qualityCap,
      allowScreenShare,
    },
  };
}

export function validateJoinRoomRequest(input: JoinRoomRequest): {
  ok: true;
  value: Required<Pick<JoinRoomRequest, "displayName">> & JoinRoomRequest;
} | {
  ok: false;
  message: string;
} {
  const displayName = input.displayName?.trim();

  if (displayName == null || displayName.length === 0) {
    return {
      ok: false,
      message: "displayName is required",
    };
  }

  if (displayName.length > 40) {
    return {
      ok: false,
      message: "displayName must be 40 characters or fewer",
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      displayName,
    },
  };
}

export function validateMediaTokenRequest(input: MediaTokenRequest): {
  ok: true;
  value: Required<Pick<MediaTokenRequest, "sessionId" | "transportPreference">> & MediaTokenRequest;
} | {
  ok: false;
  message: string;
} {
  const sessionId = input.sessionId?.trim();
  const transportPreference: TransportPreference = input.transportPreference ?? "sfu";

  if (sessionId == null || sessionId === "") {
    return {
      ok: false,
      message: "sessionId is required",
    };
  }

  if (!["sfu", "p2p"].includes(transportPreference)) {
    return {
      ok: false,
      message: "transportPreference must be sfu or p2p",
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      sessionId,
      transportPreference,
    },
  };
}

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

function createSlug(): RoomSlug {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(12);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function createHostSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function createSessionId(): string {
  return `sess_${crypto.randomBytes(8).toString("hex")}`;
}

function createRequestId(): string {
  return `req_${crypto.randomBytes(8).toString("hex")}`;
}
