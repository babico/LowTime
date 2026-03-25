import type { FastifyInstance } from "fastify";
import type { CreateRoomRequest, CreateRoomResponse, JoinRoomRequest, JoinRoomResponse, RoomSummary } from "@lowtime/shared";

import { toRoomSummary, getRoomStatus } from "../domain/room-status.js";
import { validateCreateRoomRequest, validateJoinRoomRequest } from "../domain/room-validation.js";
import {
  createRoomExpiry,
  type RouteContext,
} from "../server-support.js";

export function registerRoomRoutes(app: FastifyInstance, context: RouteContext) {
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

      const room = context.roomStore.createRoom({
        ...validation.value,
        expiresAt: createRoomExpiry(context.now()),
      });

      return {
        roomSlug: room.slug,
        joinUrl: `/r/${room.slug}`,
        hostSecret: room.hostSecret,
        expiresAt: room.expiresAt,
        room: toRoomSummary(room, context.now()),
      };
    },
  );

  app.get<{ Params: { slug: string }; Reply: RoomSummary | { message: string } }>(
    "/api/rooms/:slug",
    async (request, reply) => {
      const room = context.roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return {
          message: "Room not found",
        };
      }

      return toRoomSummary(room, context.now());
    },
  );

  app.post<{ Params: { slug: string }; Body: JoinRoomRequest; Reply: JoinRoomResponse | { message: string } }>(
    "/api/rooms/:slug/join",
    async (request, reply) => {
      const room = context.roomStore.getRoom(request.params.slug);

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

      const roomStatus = getRoomStatus(room, context.now());

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
        const lobbyRequest = context.roomStore.createLobbyRequest(room.slug, validation.value.displayName, context.now().toISOString());

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

      const session = context.roomStore.createSession(room.slug, validation.value.displayName);

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
}
