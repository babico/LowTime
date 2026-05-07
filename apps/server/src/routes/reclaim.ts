import type { FastifyInstance } from "fastify";
import type { ReclaimRoomResponse } from "@lowtime/shared";

import { getRoomStatus, toRoomSummary } from "../domain/room-status.js";
import {
  hasValidHostSecret,
  type RouteContext,
} from "../server-support.js";

/**
 * Host reclaim endpoint. Verifies a submitted host secret and returns a
 * host-visible view of the room so the web client can restore host UI in a
 * single round trip (Requirement 2.1).
 *
 * Failure modes collapse to a single generic 403 body so the endpoint cannot
 * be used to enumerate rooms or distinguish between "room does not exist",
 * "wrong secret", "cooldown active", and "missing header". Expired and closed
 * rooms return a distinct 409 so the web client can render a "room ended"
 * state rather than pretending the reclaim succeeded.
 *
 * Ordering of checks is deliberate:
 *   1. Missing header -> 403 without touching the limiter or the store.
 *   2. Unknown slug   -> 403 without touching the limiter (anti-enumeration,
 *                        Requirement 5.6).
 *   3. Cooldown       -> 403 without invoking hasValidHostSecret.
 *   4. Wrong secret   -> recordFailure, 403.
 *   5. Expired/closed -> recordSuccess, 409.
 *   6. Success        -> recordSuccess, 200 with { room, lobbyRequests }.
 */
export function registerReclaimRoutes(app: FastifyInstance, context: RouteContext) {
  app.post<{
    Params: { slug: string };
    Headers: { "x-host-secret"?: string };
    Reply: ReclaimRoomResponse | { message: string };
  }>("/api/rooms/:slug/reclaim", async (request, reply) => {
    const slug = request.params.slug;
    const headerValue = request.headers["x-host-secret"];
    const key = { clientIp: request.ip, slug };

    if (headerValue == null) {
      reply.code(403);
      return { message: "Host secret is required" };
    }

    const room = context.roomStore.getRoom(slug);
    if (room == null) {
      // Anti-enumeration: do not touch the limiter when the room does not
      // exist. A bot scanning random slugs should not lock out legitimate
      // callers (Requirement 5.6).
      reply.code(403);
      return { message: "Host secret is required" };
    }

    if (!context.reclaimRateLimiter.shouldAllow(key)) {
      reply.code(403);
      return { message: "Host secret is required" };
    }

    if (!hasValidHostSecret(room, headerValue)) {
      context.reclaimRateLimiter.recordFailure(key);
      reply.code(403);
      return { message: "Host secret is required" };
    }

    const roomStatus = getRoomStatus(room, context.now());
    if (roomStatus === "expired" || roomStatus === "closed") {
      // The caller proved possession of the secret, so clear the failure
      // counter even though we are returning 409. This matches Requirement
      // 5.3 which resets counters on successful verification independent of
      // the downstream room state.
      context.reclaimRateLimiter.recordSuccess(key);
      reply.code(409);
      return { message: "Room is no longer available" };
    }

    context.reclaimRateLimiter.recordSuccess(key);

    const lobbyRequests =
      room.accessMode === "lobby"
        ? context.roomStore
            .listLobbyRequests(room.slug)
            .map((entry) => ({
              requestId: entry.id,
              displayName: entry.displayName,
              createdAt: entry.createdAt,
            }))
        : [];

    return {
      room: toRoomSummary(room, context.now()),
      lobbyRequests,
    };
  });
}
