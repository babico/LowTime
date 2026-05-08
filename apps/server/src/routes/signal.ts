import type { FastifyInstance } from "fastify";

import { toRoomSummary } from "../domain/room-status.js";
import type { RouteContext } from "../server-support.js";
import type { SignalServerEvent } from "../domain/signal-bus.js";

/**
 * WebSocket signaling endpoint at `/signal`.
 *
 * Protocol:
 *   - Client MUST send a JSON `room.connect` message as the first frame,
 *     carrying `{ kind: "room.connect", roomSlug, sessionId }`.
 *   - Server replies with `room.snapshot` (current `RoomSummary`) on
 *     success, or with an `error` frame and closes on failure.
 *   - While connected, the socket receives every event the `SignalBus`
 *     publishes for that slug until the socket closes.
 *
 * Out of scope for this PR: chat, p2p negotiation, reconnect, media state,
 * quality update echoes. The handler ignores any subsequent client
 * message with a clear `error` frame so future extensions stay additive.
 */
export function registerSignalRoutes(
  app: FastifyInstance,
  context: RouteContext,
): void {
  void app.register(async (instance) => {
    const { default: websocketPlugin } = await import("@fastify/websocket");
    await instance.register(websocketPlugin);

    instance.get("/signal", { websocket: true }, (connection) => {
      type Socket = Pick<typeof connection, "send" | "close" | "on"> & {
        terminate?: () => void;
      };
      const socket = connection as unknown as Socket;

      let unsubscribe: (() => void) | null = null;
      let connectReceived = false;

      const safeSend = (event: SignalServerEvent) => {
        try {
          socket.send(JSON.stringify(event));
        } catch (error) {
          app.log.error(
            {
              event: "signal_route",
              action: "send_failed",
              message: error instanceof Error ? error.message : String(error),
            },
            "failed to send signal event",
          );
        }
      };

      const closeWithError = (code: string, message: string) => {
        safeSend({ kind: "error", code, message });
        try {
          socket.close(1008, message);
        } catch {
          // Fallback for runtimes that do not like close codes on early close.
          socket.terminate?.();
        }
      };

      socket.on("message", (raw: unknown) => {
        let payload: unknown;
        try {
          const text = typeof raw === "string" ? raw : (raw as { toString(): string }).toString();
          payload = JSON.parse(text);
        } catch {
          closeWithError("bad_message", "Signal message must be valid JSON");
          return;
        }

        if (!isRecord(payload) || typeof payload.kind !== "string") {
          closeWithError("bad_message", "Signal message must carry a string `kind`");
          return;
        }

        if (!connectReceived) {
          if (payload.kind !== "room.connect") {
            closeWithError("bad_connect", "Expected room.connect as the first message");
            return;
          }
          const roomSlug = typeof payload.roomSlug === "string" ? payload.roomSlug.trim() : "";
          const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
          if (roomSlug === "" || sessionId === "") {
            closeWithError("bad_connect", "room.connect requires roomSlug and sessionId");
            return;
          }
          const room = context.roomStore.getRoom(roomSlug);
          if (room == null) {
            closeWithError("unauthorized", "Session is not admitted to this room");
            return;
          }
          const knownSession = room.sessions.some((entry) => entry.id === sessionId);
          if (!knownSession) {
            closeWithError("unauthorized", "Session is not admitted to this room");
            return;
          }

          connectReceived = true;
          safeSend({
            kind: "room.snapshot",
            room: toRoomSummary(room, context.now()),
          });

          unsubscribe = context.signalBus.subscribe(roomSlug, (event) => {
            safeSend(event);
          });
          return;
        }

        // Any subsequent message is currently unsupported. Send a soft error
        // frame but keep the socket open so clients can continue to receive
        // server-pushed events.
        safeSend({
          kind: "error",
          code: "unsupported_message",
          message: `Message kind ${payload.kind} is not supported yet`,
        });
      });

      const cleanup = () => {
        unsubscribe?.();
        unsubscribe = null;
      };
      socket.on("close", cleanup);
      socket.on("error", () => {
        cleanup();
      });
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
