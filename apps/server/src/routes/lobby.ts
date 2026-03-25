import type { FastifyInstance } from "fastify";
import type { LobbyRequestStatusResponse, LobbyRequestSummary } from "@lowtime/shared";

import {
  getRoomStatus,
  hasValidHostSecret,
  type RouteContext,
} from "../server-support.js";

export function registerLobbyRoutes(app: FastifyInstance, context: RouteContext) {
  app.get<{ Params: { slug: string }; Headers: { "x-host-secret"?: string }; Reply: { requests: LobbyRequestSummary[] } | { message: string } }>(
    "/api/rooms/:slug/lobby",
    async (request, reply) => {
      const room = context.roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      return {
        requests: context.roomStore.listLobbyRequests(room.slug).map((entry) => ({
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
      const room = context.roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      const lobbyRequest = context.roomStore.getLobbyRequest(room.slug, request.params.requestId);

      if (lobbyRequest == null) {
        reply.code(404);
        return { message: "Lobby request not found" };
      }

      const roomStatus = getRoomStatus(room, context.now());

      if (roomStatus === "expired") {
        context.roomStore.denyLobbyRequest(room.slug, lobbyRequest.id, "room_expired");
        return { status: "denied", reason: "room_expired" };
      }

      if (roomStatus === "closed") {
        context.roomStore.denyLobbyRequest(room.slug, lobbyRequest.id, "room_closed");
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
      const room = context.roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      const roomStatus = getRoomStatus(room, context.now());
      if (roomStatus === "expired" || roomStatus === "closed") {
        reply.code(409);
        return { message: "Room is no longer available" };
      }

      const lobbyRequest = context.roomStore.approveLobbyRequest(room.slug, request.params.requestId);

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
      const room = context.roomStore.getRoom(request.params.slug);

      if (room == null) {
        reply.code(404);
        return { message: "Room not found" };
      }

      if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
        reply.code(403);
        return { message: "Host secret is required" };
      }

      const lobbyRequest = context.roomStore.denyLobbyRequest(room.slug, request.params.requestId, "host_denied");

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
}
