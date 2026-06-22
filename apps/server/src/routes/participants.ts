import type { FastifyInstance } from "fastify";

import { attemptRemoveParticipant } from "../domain/remove-participant.js";
import { hasValidHostSecret, type RouteContext } from "../server-support.js";

/**
 * Host moderation endpoint. Removes a participant session from the room
 * and broadcasts a `participant_removed` event on the signal bus so every
 * connected socket (including the kicked one) can update its UI.
 *
 * The endpoint is host-secret-gated. The host cannot remove themselves
 * (the room would have no other session to act as host).
 */
export function registerParticipantsRoutes(app: FastifyInstance, context: RouteContext) {
  app.post<{
    Params: { slug: string; sessionId: string };
    Headers: { "x-host-secret"?: string };
    Reply: { ok: true; removedSessionId: string } | { message: string };
  }>("/api/rooms/:slug/participants/:sessionId/remove", async (request, reply) => {
    const room = context.roomStore.getRoom(request.params.slug);

    if (room == null) {
      reply.code(404);
      return { message: "Room not found" };
    }

    if (!hasValidHostSecret(room, request.headers["x-host-secret"])) {
      reply.code(403);
      return { message: "Host secret is required" };
    }

    const result = attemptRemoveParticipant({
      room,
      hostSecret: request.headers["x-host-secret"],
      targetSessionId: request.params.sessionId,
      now: context.now(),
    });

    if (!result.ok) {
      switch (result.reason) {
        case "target_not_found":
          reply.code(404);
          return { message: "Participant is not in this room" };
        case "cannot_remove_host":
          reply.code(409);
          return { message: "The host cannot remove themselves" };
        case "invalid_host_secret":
          reply.code(403);
          return { message: "Host secret is required" };
      }
    }

    context.signalBus.publish(room.slug, {
      kind: "participant_removed",
      sessionId: result.removed.id,
      reason: "host_removed",
    });

    return { ok: true, removedSessionId: result.removed.id };
  });
}
