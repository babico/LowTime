import type { FastifyInstance } from "fastify";
import type { MediaTokenRequest, MediaTokenResponse } from "@lowtime/shared";

import { getRoomStatus } from "../domain/room-status.js";
import { validateMediaTokenRequest } from "../domain/room-validation.js";
import { issueSfuToken } from "../livekit.js";
import {
  type RouteContext,
} from "../server-support.js";

export function registerMediaRoutes(app: FastifyInstance, context: RouteContext) {
  app.post<{ Params: { slug: string }; Body: MediaTokenRequest; Reply: MediaTokenResponse | { message: string } }>(
    "/api/rooms/:slug/token",
    async (request, reply) => {
      const room = context.roomStore.getRoom(request.params.slug);

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

      const roomStatus = getRoomStatus(room, context.now());

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

      if (context.liveKitConfig == null) {
        reply.code(503);
        return {
          message: "SFU media service is not configured",
        };
      }

      return issueSfuToken(context.liveKitConfig, {
        roomName: room.slug,
        participantIdentity: session.id,
        participantName: session.displayName,
      });
    },
  );
}
