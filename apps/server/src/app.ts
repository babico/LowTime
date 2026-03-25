import crypto from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type {
  AccessMode,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  LobbyRequestStatusResponse,
  LobbyRequestSummary,
  MediaTokenRequest,
  MediaTokenResponse,
  QualityCap,
  RoomSlug,
  RoomSummary,
  TransportPreference,
} from "@lowtime/shared";

import { getLiveKitConfig, issueSfuToken, type LiveKitConfig } from "./livekit.js";

const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_PARTICIPANTS = 2;
const DEFAULT_QUALITY_CAP: QualityCap = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
const DEFAULT_ALLOW_SCREEN_SHARE = true;

const ACCESS_MODES: AccessMode[] = ["open", "lobby", "passcode"];
const QUALITY_CAPS: QualityCap[] = ["low", "balanced", "high"];

interface StoredRoom extends RoomSummary {
  hostSecret: string;
  sessions: StoredSession[];
  lobbyRequests: StoredLobbyRequest[];
}

interface CreateStoredRoomInput {
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  expiresAt: string;
}

interface StoredSession {
  id: string;
  displayName: string;
}

interface StoredLobbyRequest {
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

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  const now = options.now ?? (() => new Date());
  const roomStore = options.roomStore ?? createInMemoryRoomStore();
  const liveKitConfig = options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig;

  void app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "lowtime-server",
    };
  });

  app.post<{ Body: CreateRoomRequest; Reply: CreateRoomResponse | { message: string } }>(
    "/api/rooms",
    async (request, reply) => {
      const body = request.body ?? {};
      const validation = validateCreateRoomRequest(body);

      if (!validation.ok) {
        reply.code(400);
        return {
          message: validation.message,
        };
      }

      const expiresAt = new Date(now().getTime() + DEFAULT_ROOM_TTL_MS).toISOString();
      const room = roomStore.createRoom({
        ...validation.value,
        expiresAt,
      });

      return {
        roomSlug: room.slug,
        joinUrl: `/r/${room.slug}`,
        hostSecret: room.hostSecret,
        expiresAt: room.expiresAt,
        room: toRoomSummary(room, now()),
      };
    },
  );

  app.get<{ Params: { slug: string }; Reply: RoomSummary | { message: string } }>(
    "/api/rooms/:slug",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return {
          message: "Room not found",
        };
      }

      return toRoomSummary(room, now());
    },
  );

  app.post<{ Params: { slug: string }; Body: JoinRoomRequest; Reply: JoinRoomResponse | { message: string } }>(
    "/api/rooms/:slug/join",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return {
          message: "Room not found",
        };
      }

      const validation = validateJoinRoomRequest(request.body ?? {});

      if (!validation.ok) {
        reply.code(400);
        return {
          message: validation.message,
        };
      }

      const roomStatus = getRoomStatus(room, now());

      if (roomStatus === "expired" || roomStatus === "closed") {
        return {
          joinState: "denied",
          reason: "room_expired",
        };
      }

      if (room.sessions.length >= room.maxParticipants) {
        return {
          joinState: "denied",
          reason: "room_full",
        };
      }

      if (room.accessMode === "passcode") {
        return {
          joinState: "denied",
          reason: validation.value.passcode == null ? "passcode_required" : "invalid_passcode",
        };
      }

      if (room.accessMode === "lobby") {
        const lobbyRequest = roomStore.createLobbyRequest(room.slug, validation.value.displayName, now().toISOString());

        if (lobbyRequest == null) {
          return {
            joinState: "denied",
            reason: "room_full",
          };
        }

        return {
          joinState: "waiting",
          requestId: lobbyRequest.id,
        };
      }

      const session = roomStore.createSession(room.slug, validation.value.displayName);

      if (session == null) {
        return {
          joinState: "denied",
          reason: "room_full",
        };
      }

      room.status = "active";

      return {
        joinState: "direct",
        sessionId: session.id,
        transportPreference: "sfu",
      };
    },
  );

  app.get<{ Params: { slug: string }; Headers: { "x-host-secret"?: string }; Reply: { requests: LobbyRequestSummary[] } | { message: string } }>(
    "/api/rooms/:slug/lobby",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      return {
        requests: roomStore.listLobbyRequests(room.slug).map((entry) => ({
          requestId: entry.id,
          displayName: entry.displayName,
          createdAt: entry.createdAt,
        })),
      };
    },
  );

  app.get<{ Params: { slug: string; requestId: string }; Reply: LobbyRequestStatusResponse | { message: string } }>(
    "/api/rooms/:slug/lobby/:requestId",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      const lobbyRequest = roomStore.getLobbyRequest(room.slug, request.params.requestId);

      if (lobbyRequest == null) {
        reply.code(404);
        return { message: "Lobby request not found" };
      }

      const roomStatus = getRoomStatus(room, now());

      if (roomStatus === "expired") {
        roomStore.denyLobbyRequest(room.slug, lobbyRequest.id, "room_expired");
        return { status: "denied", reason: "room_expired" };
      }

      if (roomStatus === "closed") {
        roomStore.denyLobbyRequest(room.slug, lobbyRequest.id, "room_closed");
        return { status: "denied", reason: "room_closed" };
      }

      if (lobbyRequest.status === "approved" && lobbyRequest.sessionId != null && lobbyRequest.transportPreference != null) {
        return {
          status: "approved",
          sessionId: lobbyRequest.sessionId,
          transportPreference: lobbyRequest.transportPreference,
        };
      }

      if (lobbyRequest.status === "denied") {
        return {
          status: "denied",
          reason: lobbyRequest.denialReason ?? "host_denied",
        };
      }

      return {
        status: "waiting",
      };
    },
  );

  app.post<{ Params: { slug: string; requestId: string }; Headers: { "x-host-secret"?: string }; Reply: LobbyRequestStatusResponse | { message: string } }>(
    "/api/rooms/:slug/lobby/:requestId/approve",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      const roomStatus = getRoomStatus(room, now());
      if (roomStatus === "expired" || roomStatus === "closed") {
        reply.code(409);
        return { message: "Room is no longer available" };
      }

      const lobbyRequest = roomStore.approveLobbyRequest(room.slug, request.params.requestId);

      if (lobbyRequest == null || lobbyRequest.sessionId == null || lobbyRequest.transportPreference == null) {
        reply.code(404);
        return { message: "Lobby request not found" };
      }

      room.status = "active";

      return {
        status: "approved",
        sessionId: lobbyRequest.sessionId,
        transportPreference: lobbyRequest.transportPreference,
      };
    },
  );

  app.post<{ Params: { slug: string; requestId: string }; Headers: { "x-host-secret"?: string }; Reply: LobbyRequestStatusResponse | { message: string } }>(
    "/api/rooms/:slug/lobby/:requestId/deny",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      const lobbyRequest = roomStore.denyLobbyRequest(room.slug, request.params.requestId, "host_denied");

      if (lobbyRequest == null) {
        reply.code(404);
        return { message: "Lobby request not found" };
      }

      return {
        status: "denied",
        reason: "host_denied",
      };
    },
  );

  app.post<{ Params: { slug: string }; Body: MediaTokenRequest; Reply: MediaTokenResponse | { message: string } }>(
    "/api/rooms/:slug/token",
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return {
          message: "Room not found",
        };
      }

      const validation = validateMediaTokenRequest(request.body ?? {});

      if (!validation.ok) {
        reply.code(400);
        return {
          message: validation.message,
        };
      }

      const roomStatus = getRoomStatus(room, now());

      if (roomStatus === "expired" || roomStatus === "closed") {
        reply.code(410);
        return {
          message: "Room is no longer available for media join",
        };
      }

      const session = room.sessions.find((entry) => entry.id === validation.value.sessionId);

      if (session == null) {
        reply.code(404);
        return {
          message: "Session not found",
        };
      }

      if (validation.value.transportPreference !== "sfu") {
        reply.code(400);
        return {
          message: "Only SFU transport is currently available",
        };
      }

      if (liveKitConfig == null) {
        reply.code(503);
        return {
          message: "SFU media service is not configured",
        };
      }

      return issueSfuToken(liveKitConfig, {
        roomName: room.slug,
        participantIdentity: session.id,
        participantName: session.displayName,
      });
    },
  );

  return app;
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

      if (room == null || room.sessions.length + room.lobbyRequests.filter((entry) => entry.status === "waiting").length >= room.maxParticipants) {
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

function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}

function validateCreateRoomRequest(input: CreateRoomRequest): {
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

function validateJoinRoomRequest(input: JoinRoomRequest): {
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

function validateMediaTokenRequest(input: MediaTokenRequest): {
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

function toRoomSummary(room: StoredRoom, now = new Date()): RoomSummary {
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

function getRoomStatus(room: StoredRoom, now: Date): RoomSummary["status"] {
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

export function parsePort(value: string | undefined): number {
  if (value == null || value.trim() === "") {
    return 3000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}
