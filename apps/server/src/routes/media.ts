import type { FastifyInstance } from "fastify";
import type {
  IceServerConfig,
  MediaTokenRequest,
  MediaTokenResponse,
  P2PTokenResponse,
} from "@lowtime/shared";

import { getRoomStatus } from "../domain/room-status.js";
import type { StoredRoom } from "../domain/room-store.js";
import { validateMediaTokenRequest } from "../domain/room-validation.js";
import { recordEvent } from "../domain/metrics.js";
import { issueSfuToken } from "../livekit.js";
import {
  type RouteContext,
} from "../server-support.js";

export interface IssueP2PTokenInput {
  room: StoredRoom;
  sessionId: string;
  iceServers: IceServerConfig[];
}

/**
 * Pure helper that assigns caller/callee roles by session index and returns
 * a `P2PTokenResponse`. The first session in the room's session list is
 * always the caller; the second is always the callee. This is deterministic
 * and idempotent for any given (room, sessionId) pair.
 */
export function issueP2PToken(input: IssueP2PTokenInput): P2PTokenResponse {
  const sessionIndex = input.room.sessions.findIndex((s) => s.id === input.sessionId);
  const offerRole: "caller" | "callee" = sessionIndex === 0 ? "caller" : "callee";
  return {
    transport: "p2p",
    p2pSession: {
      offerRole,
      iceServers: input.iceServers,
    },
  };
}

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
        reply.code(410);
        return {
          message: "Session expired; rejoin the room",
        };
      }

      // Bump lastSeenAt so the session stays fresh while the client is active.
      context.roomStore.touchSession(room.slug, session.id, context.now());

      // P2P transport branch.
      if (validation.value.transportPreference === "p2p") {
        if (room.maxParticipants !== 2) {
          context.metrics.record(
            recordEvent("join_rejected", { reason: "p2p_group_room" }),
          );
          reply.code(400);
          return {
            message: "P2P transport is only available for 1:1 rooms",
          };
        }
        context.metrics.record(
          recordEvent("p2p_fallback_triggered", { maxParticipants: "2" }),
        );
        return issueP2PToken({
          room,
          sessionId: session.id,
          iceServers: context.iceServers,
        });
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
