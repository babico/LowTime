import type { FastifyInstance } from "fastify";
import type {
  UpdateRoomSettingsRequest,
  UpdateRoomSettingsResponse,
} from "@lowtime/shared";

import { toRoomSummary } from "../domain/room-status.js";
import { validateUpdateSettingsRequest } from "../domain/room-validation.js";
import {
  hasValidHostSecret,
  type RouteContext,
} from "../server-support.js";

/**
 * Host-only settings endpoint. Currently supports two transitions:
 *   - rotating the passcode on a passcode room
 *   - changing the access mode between open, lobby, and passcode
 *
 * Both transitions clear the rate limiter for the room so a freshly-rotated
 * passcode is not locked out by residual cooldown state (Requirement 8.1).
 *
 * The endpoint never echoes the new plaintext passcode in its response
 * (Requirement 9.3): the host is expected to remember what they just sent.
 */
export function registerSettingsRoutes(app: FastifyInstance, context: RouteContext) {
  app.post<{
    Params: { slug: string };
    Body: UpdateRoomSettingsRequest;
    Headers: { "x-host-secret"?: string };
    Reply: UpdateRoomSettingsResponse | { message: string };
  }>("/api/rooms/:slug/settings", async (request, reply) => {
    const room = context.roomStore.getRoom(request.params.slug);

    if (room == null) {
      reply.code(404);
      return { message: "Room not found" };
    }

    if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
      reply.code(403);
      return { message: "Host secret is required" };
    }

    const body = request.body ?? {};
    const validation = validateUpdateSettingsRequest(body);

    if (!validation.ok) {
      reply.code(400);
      return { message: validation.message };
    }

    const decision = validation.value;

    if (decision.kind === "clear-passcode") {
      room.accessMode = decision.accessMode;
      context.roomStore.clearPasscodeHash(room.slug);
      context.passcodeRateLimiter.clear(room.slug);
      return { room: toRoomSummary(room, context.now()) };
    }

    if (decision.kind === "rotate") {
      // Rotation only makes sense when the room is already in passcode mode.
      if (room.accessMode !== "passcode") {
        reply.code(400);
        return { message: "passcode rotation requires passcode access mode" };
      }
    }

    // Both "rotate" and "set-passcode" hash the new plaintext and replace the
    // stored hash. We never touch the plaintext beyond the hashing step.
    const encodedHash = await context.passcodeVerifier.hash(decision.passcode);
    context.roomStore.setPasscodeHash(room.slug, encodedHash);
    if (decision.kind === "set-passcode") {
      room.accessMode = "passcode";
    }
    context.passcodeRateLimiter.clear(room.slug);

    return { room: toRoomSummary(room, context.now()) };
  });
}
