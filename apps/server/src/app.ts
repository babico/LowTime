import crypto from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

import type {
  AccessMode,
  CreateRoomRequest,
  CreateRoomResponse,
  QualityCap,
  RoomSlug,
  RoomSummary,
} from "@lowtime/shared";

const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_PARTICIPANTS = 2;
const DEFAULT_QUALITY_CAP: QualityCap = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
const DEFAULT_ALLOW_SCREEN_SHARE = true;

const ACCESS_MODES: AccessMode[] = ["open", "lobby", "passcode"];
const QUALITY_CAPS: QualityCap[] = ["low", "balanced", "high"];

interface StoredRoom extends RoomSummary {
  hostSecret: string;
}

interface CreateStoredRoomInput {
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  expiresAt: string;
}

export interface RoomStore {
  createRoom(input: CreateStoredRoomInput): StoredRoom;
  getRoom(slug: RoomSlug): StoredRoom | undefined;
}

export interface BuildAppOptions {
  now?: () => Date;
  roomStore?: RoomStore;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  const now = options.now ?? (() => new Date());
  const roomStore = options.roomStore ?? createInMemoryRoomStore();

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
        room: toRoomSummary(room),
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

      return toRoomSummary(room);
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
      };

      rooms.set(slug, room);

      return room;
    },
    getRoom(slug) {
      return rooms.get(slug);
    },
  };
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

function toRoomSummary(room: StoredRoom): RoomSummary {
  return {
    slug: room.slug,
    accessMode: room.accessMode,
    maxParticipants: room.maxParticipants,
    qualityCap: room.qualityCap,
    allowScreenShare: room.allowScreenShare,
    status: room.status,
    expiresAt: room.expiresAt,
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
