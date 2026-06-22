import type { FastifyInstance } from "fastify";
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomSummary,
} from "@lowtime/shared";

import { toRoomSummary, getRoomStatus } from "../domain/room-status.js";
import { recordRoomActivity } from "../domain/room-activity.js";
import { validateCreateRoomRequest, validateJoinRoomRequest } from "../domain/room-validation.js";
import { recordEvent } from "../domain/metrics.js";
import {
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

      const { passcode: plainPasscode, ...storeInput } = validation.value;
      const passcodeHash =
        plainPasscode != null ? await context.passcodeVerifier.hash(plainPasscode) : undefined;

      const now = context.now();
      const room = context.roomStore.createRoom(
        {
          ...storeInput,
          initialActivity: now.toISOString(),
          passcodeHash,
        },
        now,
      );

      const responseBody: CreateRoomResponse = {
        roomSlug: room.slug,
        joinUrl: `/r/${room.slug}`,
        hostSecret: room.hostSecret,
        expiresAt: room.expiresAt,
        room: toRoomSummary(room, context.now()),
      };

      context.metrics.record(
        recordEvent("room_created", {
          accessMode: room.accessMode,
          maxParticipants: String(room.maxParticipants),
          hasPasscode: plainPasscode != null ? "true" : "false",
        }),
      );

      if (plainPasscode != null) {
        responseBody.passcode = plainPasscode;
      }

      return responseBody;
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
        context.metrics.record(recordEvent("join_rejected", { reason: "room_not_found" }));
        return {
          message: "Room not found",
        };
      }

      const validation = validateJoinRoomRequest(request.body ?? {});

      if (!validation.ok) {
        reply.code(400);
        context.metrics.record(recordEvent("join_rejected", { reason: "validation" }));
        return {
          message: validation.message,
        };
      }

      const roomStatus = getRoomStatus(room, context.now());

      if (roomStatus === "expired" || roomStatus === "closed") {
        context.metrics.record(recordEvent("join_rejected", { reason: "room_expired" }));
        return {
          joinState: "denied",
          reason: "room_expired",
        };
      }

      if (room.sessions.length >= room.maxParticipants) {
        context.metrics.record(recordEvent("join_rejected", { reason: "room_full" }));
        return {
          joinState: "denied",
          reason: "room_full",
        };
      }

      if (room.accessMode === "passcode") {
        const submittedPasscode = validation.value.passcode;
        if (submittedPasscode == null || submittedPasscode === "") {
          context.metrics.record(recordEvent("join_rejected", { reason: "passcode_required" }));
          return {
            joinState: "denied",
            reason: "passcode_required",
          };
        }

        const key = { clientIp: request.ip, slug: room.slug };

        if (!context.passcodeRateLimiter.shouldAllow(key)) {
          context.metrics.record(recordEvent("join_rejected", { reason: "rate_limited" }));
          return {
            joinState: "denied",
            reason: "invalid_passcode",
          };
        }

        const match =
          room.passcodeHash != null &&
          (await context.passcodeVerifier.verify(room.passcodeHash, submittedPasscode));

        if (!match) {
          context.passcodeRateLimiter.recordFailure(key);
          context.metrics.record(recordEvent("passcode_failure"));
          return {
            joinState: "denied",
            reason: "invalid_passcode",
          };
        }

        context.passcodeRateLimiter.recordSuccess(key);
        // Fall through to the direct-session admission path below.
      }

      if (room.accessMode === "lobby") {
        const lobbyRequest = context.roomStore.createLobbyRequest(
          room.slug,
          validation.value.displayName,
          context.now().toISOString(),
        );

        if (lobbyRequest == null) {
          context.metrics.record(recordEvent("join_rejected", { reason: "room_full" }));
          return {
            joinState: "denied",
            reason: "room_full",
          };
        }

        context.metrics.record(
          recordEvent("join_succeeded", { state: "waiting", accessMode: "lobby" }),
        );
        return {
          joinState: "waiting",
          requestId: lobbyRequest.id,
        };
      }

      const session = context.roomStore.createSession(room.slug, validation.value.displayName, context.now());

      if (session == null) {
        context.metrics.record(recordEvent("join_rejected", { reason: "room_full" }));
        return {
          joinState: "denied",
          reason: "room_full",
        };
      }

      room.status = "active";
      recordRoomActivity(context.roomStore, room.slug, context.now());

      context.metrics.record(
        recordEvent("join_succeeded", {
          state: "direct",
          accessMode: room.accessMode,
          maxParticipants: String(room.maxParticipants),
        }),
      );

      return {
        joinState: "direct",
        sessionId: session.id,
        transportPreference: "sfu",
      };
    },
  );
}
