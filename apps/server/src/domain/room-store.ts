import crypto from "node:crypto";

import type {
  AccessMode,
  QualityCap,
  RoomSlug,
  RoomSummary,
  TransportPreference,
} from "@lowtime/shared";

/** Two hours. Inactivity TTL applied to rooms on every activity bump. */
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export type LobbyDenialReason = "host_denied" | "room_expired" | "room_closed" | "lobby_timeout";

export interface StoredRoom extends RoomSummary {
  hostSecret: string;
  passcodeHash: string | null;
  sessions: StoredSession[];
  lobbyRequests: StoredLobbyRequest[];
  lastActivityAt: string;
  closedAt: string | null;
}

export interface CreateStoredRoomInput {
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  /**
   * Seed timestamp for `lastActivityAt`. Defaults to the ambient clock passed
   * into `createRoom`. Tests use this seam to freeze the initial expiry.
   */
  initialActivity?: string;
  passcodeHash?: string;
}

export interface StoredSession {
  id: string;
  displayName: string;
  /** ISO-8601 UTC. Set on creation and bumped on every successful token issuance and heartbeat. */
  lastSeenAt: string;
}

export interface StoredLobbyRequest {
  id: string;
  displayName: string;
  createdAt: string;
  status: "waiting" | "approved" | "denied";
  sessionId?: string;
  transportPreference?: TransportPreference;
  denialReason?: LobbyDenialReason;
}

export interface RoomStore {
  /**
   * Creates a new room. `now` is the authoritative wall-clock used to seed
   * `lastActivityAt` when `input.initialActivity` is omitted, and to compute
   * the derived `expiresAt = lastActivityAt + ROOM_TTL_MS`.
   */
  createRoom(input: CreateStoredRoomInput, now: Date): StoredRoom;
  getRoom(slug: RoomSlug): StoredRoom | undefined;
  /** Returns a fresh array of slugs. Safe to iterate while mutating the store. */
  listRoomSlugs(): RoomSlug[];
  /** Removes a room and its sub-arrays. Returns the removed record. */
  deleteRoom(slug: RoomSlug): StoredRoom | undefined;
  /** Updates the activity seed and the derived expiry together. */
  setRoomActivity(
    slug: RoomSlug,
    lastActivityAt: string,
    expiresAt: string,
  ): boolean;
  setPasscodeHash(slug: RoomSlug, hash: string): boolean;
  clearPasscodeHash(slug: RoomSlug): boolean;
  createSession(roomSlug: RoomSlug, displayName: string, now: Date): StoredSession | undefined;
  /**
   * Bumps `lastSeenAt` for an existing session. Returns `true` on success,
   * `false` if the session is unknown (already reaped or never existed).
   */
  touchSession(slug: RoomSlug, sessionId: string, now: Date): boolean;
  /** Removes the session and returns it, or `undefined` if not found. */
  deleteSession(slug: RoomSlug, sessionId: string): StoredSession | undefined;
  createLobbyRequest(
    roomSlug: RoomSlug,
    displayName: string,
    createdAt: string,
  ): StoredLobbyRequest | undefined;
  listLobbyRequests(roomSlug: RoomSlug): StoredLobbyRequest[];
  getLobbyRequest(
    roomSlug: RoomSlug,
    requestId: string,
  ): StoredLobbyRequest | undefined;
  approveLobbyRequest(
    roomSlug: RoomSlug,
    requestId: string,
    now: Date,
  ): StoredLobbyRequest | undefined;
  denyLobbyRequest(
    roomSlug: RoomSlug,
    requestId: string,
    reason: LobbyDenialReason,
  ): StoredLobbyRequest | undefined;
}

function computeExpiry(lastActivityAt: string): string {
  return new Date(Date.parse(lastActivityAt) + ROOM_TTL_MS).toISOString();
}

export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<RoomSlug, StoredRoom>();

  return {
    createRoom(input, now) {
      let slug = createSlug();

      while (rooms.has(slug)) {
        slug = createSlug();
      }

      const lastActivityAt = input.initialActivity ?? now.toISOString();
      const expiresAt = computeExpiry(lastActivityAt);

      const room: StoredRoom = {
        slug,
        accessMode: input.accessMode,
        maxParticipants: input.maxParticipants,
        qualityCap: input.qualityCap,
        allowScreenShare: input.allowScreenShare,
        status: "created",
        expiresAt,
        hostSecret: createHostSecret(),
        passcodeHash: input.passcodeHash ?? null,
        sessions: [],
        lobbyRequests: [],
        lastActivityAt,
        closedAt: null,
      };

      rooms.set(slug, room);

      return room;
    },
    getRoom(slug) {
      return rooms.get(slug);
    },
    listRoomSlugs() {
      return [...rooms.keys()];
    },
    deleteRoom(slug) {
      const room = rooms.get(slug);
      if (room == null) {
        return undefined;
      }
      rooms.delete(slug);
      return room;
    },
    setRoomActivity(slug, lastActivityAt, expiresAt) {
      const room = rooms.get(slug);
      if (room == null) {
        return false;
      }
      room.lastActivityAt = lastActivityAt;
      room.expiresAt = expiresAt;
      return true;
    },
    setPasscodeHash(slug, hash) {
      const room = rooms.get(slug);
      if (room == null) {
        return false;
      }
      room.passcodeHash = hash;
      return true;
    },
    clearPasscodeHash(slug) {
      const room = rooms.get(slug);
      if (room == null) {
        return false;
      }
      room.passcodeHash = null;
      return true;
    },
    createSession(roomSlug, displayName, now) {
      const room = rooms.get(roomSlug);

      if (room == null || room.sessions.length >= room.maxParticipants) {
        return undefined;
      }

      const session: StoredSession = {
        id: createSessionId(),
        displayName,
        lastSeenAt: now.toISOString(),
      };

      room.sessions.push(session);

      return session;
    },
    touchSession(slug, sessionId, now) {
      const room = rooms.get(slug);
      if (room == null) return false;
      const session = room.sessions.find((s) => s.id === sessionId);
      if (session == null) return false;
      session.lastSeenAt = now.toISOString();
      return true;
    },
    deleteSession(slug, sessionId) {
      const room = rooms.get(slug);
      if (room == null) return undefined;
      const idx = room.sessions.findIndex((s) => s.id === sessionId);
      if (idx === -1) return undefined;
      const [removed] = room.sessions.splice(idx, 1);
      return removed;
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
    approveLobbyRequest(roomSlug, requestId, now) {
      const room = rooms.get(roomSlug);
      const request = room?.lobbyRequests.find((entry) => entry.id === requestId);

      if (room == null || request == null || request.status !== "waiting" || room.sessions.length >= room.maxParticipants) {
        return undefined;
      }

      const session = this.createSession(roomSlug, request.displayName, now);
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

      // Do not overwrite an existing denialReason (Requirement 10.5). The tick
      // only reaches this call path for still-"waiting" requests, but a direct
      // caller that bypasses the status guard would otherwise erase a valid
      // prior reason.
      if (request.status !== "waiting" && request.denialReason != null) {
        return request;
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
