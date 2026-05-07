import crypto from "node:crypto";

import type {
  AccessMode,
  QualityCap,
  RoomSlug,
  RoomSummary,
  TransportPreference,
} from "@lowtime/shared";

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
