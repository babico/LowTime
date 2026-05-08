import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import { toRoomSummary } from "../domain/room-status.js";
import type { RouteContext } from "../server-support.js";
import type { SignalServerEvent } from "../domain/signal-bus.js";

/** Maximum chat message body length in UTF-16 code units. */
const CHAT_MAX_BODY_LENGTH = 500;

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
 *   - After connect, the client may send `room.ping` to keep the session
 *     alive; the server replies with `room.pong`.
 *   - For 1:1 rooms, the client may send `p2p.offer`, `p2p.answer`, and
 *     `p2p.ice` messages; the server relays them to the other session.
 */
export function registerSignalRoutes(
  app: FastifyInstance,
  context: RouteContext,
): void {
  // Socket registry: slug → (sessionId → safeSend). Used for P2P relay.
  // This is closure-local and intentionally not shared with SignalBus.
  type SafeSendFn = (event: SignalServerEvent | Record<string, unknown>) => void;
  const socketRegistry = new Map<string, Map<string, SafeSendFn>>();

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
      let connectedSlug = "";
      let connectedSessionId = "";

      const safeSend = (event: SignalServerEvent | Record<string, unknown>) => {
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
          connectedSlug = roomSlug;
          connectedSessionId = sessionId;

          safeSend({
            kind: "room.snapshot",
            room: toRoomSummary(room, context.now()),
          });

          unsubscribe = context.signalBus.subscribe(roomSlug, (event) => {
            safeSend(event);
          });

          // Register in the socket registry for P2P relay.
          let peers = socketRegistry.get(roomSlug);
          if (peers == null) {
            peers = new Map();
            socketRegistry.set(roomSlug, peers);
          }
          peers.set(sessionId, safeSend);

          // Emit transport.switch_available to both sessions when the second
          // session connects to a 1:1 room.
          if (room.maxParticipants === 2 && peers.size === 2) {
            for (const peerSend of peers.values()) {
              peerSend({ kind: "transport.switch_available", nextTransport: "p2p" });
            }
          }

          return;
        }

        // Handle room.ping heartbeat to keep the session alive.
        if (payload.kind === "room.ping") {
          const now = context.now();
          const touched = context.roomStore.touchSession(connectedSlug, connectedSessionId, now);
          if (!touched) {
            // Session was reaped between connect and this ping.
            safeSend({
              kind: "error",
              code: "session_expired",
              message: "Session expired; rejoin the room",
            });
            try {
              socket.close(1008, "Session expired");
            } catch {
              socket.terminate?.();
            }
            return;
          }
          safeSend({ kind: "room.pong", serverTime: now.toISOString() } as unknown as SignalServerEvent);
          return;
        }

        // Handle P2P signaling relay.
        if (payload.kind === "p2p.offer" || payload.kind === "p2p.answer" || payload.kind === "p2p.ice") {
          const room = context.roomStore.getRoom(connectedSlug);
          if (room == null || room.maxParticipants !== 2) {
            safeSend({
              kind: "error",
              code: "p2p_not_available",
              message: "P2P signaling is not available for this room",
            });
            return;
          }
          const peers = socketRegistry.get(connectedSlug);
          if (peers == null || peers.size !== 2) {
            safeSend({
              kind: "error",
              code: "p2p_not_ready",
              message: "P2P signaling requires exactly two connected participants",
            });
            return;
          }
          // Relay to the other session only (no echo).
          for (const [peerId, peerSend] of peers) {
            if (peerId !== connectedSessionId) {
              peerSend({ kind: payload.kind, payload: payload.payload });
            }
          }
          return;
        }

        // Handle chat.send — broadcast to all room subscribers.
        if (payload.kind === "chat.send") {
          const body = typeof payload.body === "string" ? payload.body.trim() : "";
          if (body.length === 0 || body.length > CHAT_MAX_BODY_LENGTH) {
            safeSend({
              kind: "error",
              code: "invalid_message",
              message: `Chat message must be 1–${CHAT_MAX_BODY_LENGTH} characters`,
            });
            return;
          }
          const room = context.roomStore.getRoom(connectedSlug);
          if (room == null) {
            safeSend({ kind: "error", code: "unauthorized", message: "Room not found" });
            return;
          }
          const session = room.sessions.find((s) => s.id === connectedSessionId);
          if (session == null) {
            safeSend({ kind: "error", code: "session_expired", message: "Session expired; rejoin the room" });
            return;
          }
          const message = {
            id: `msg_${crypto.randomBytes(8).toString("hex")}`,
            senderId: connectedSessionId,
            senderName: session.displayName,
            body,
            createdAt: context.now().toISOString(),
          };
          context.signalBus.publish(connectedSlug, { kind: "chat.received", message });
          return;
        }

        // Any other subsequent message is currently unsupported. Send a soft error
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
        // Remove from socket registry.
        if (connectedSlug !== "" && connectedSessionId !== "") {
          const peers = socketRegistry.get(connectedSlug);
          if (peers != null) {
            peers.delete(connectedSessionId);
            if (peers.size === 0) {
              socketRegistry.delete(connectedSlug);
            }
          }
        }
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
