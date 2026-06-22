import { useEffect, useRef, useState } from "react";

import type { ChatMessage, RoomSummary } from "@lowtime/shared";
import { RECONNECT_WINDOW_MS } from "@lowtime/shared";

export type SignalState = "idle" | "connecting" | "connected" | "error" | "closed";

export type SignalServerEvent =
  | { kind: "room.snapshot"; room: RoomSummary }
  | { kind: "room.settings_updated"; room: RoomSummary }
  | { kind: "transport.switch_available"; nextTransport: "p2p" }
  | { kind: "chat.received"; message: ChatMessage }
  | { kind: "participant_removed"; sessionId: string; reason: "host_removed" }
  | { kind: "p2p.offer"; payload: { sdp: string } }
  | { kind: "p2p.answer"; payload: { sdp: string } }
  | { kind: "p2p.ice"; payload: RTCIceCandidateInit }
  | { kind: "error"; code: string; message: string };

export type P2PSignalEvent =
  | { kind: "p2p.offer"; payload: { sdp: string } }
  | { kind: "p2p.answer"; payload: { sdp: string } }
  | { kind: "p2p.ice"; payload: RTCIceCandidateInit };

export interface UseRoomSignalingInput {
  apiBaseUrl: string;
  slug: string | null;
  sessionId: string | null;
  /** Called when a p2p.offer, p2p.answer, or p2p.ice message arrives from the server. */
  onP2PMessage?: (event: P2PSignalEvent) => void;
}

export interface UseRoomSignalingState {
  signalState: SignalState;
  latestRoomSummary: RoomSummary | null;
  /** True when the server has indicated the session has expired and the user must rejoin. */
  sessionExpired: boolean;
  /** True when the server has indicated P2P fallback is available for this room. */
  p2pAvailable: boolean;
  /** True when the server has indicated the host removed this session. */
  removedFromRoom: boolean;
  /** Ordered list of chat messages received since the socket connected. */
  chatMessages: ChatMessage[];
  /** Send a raw message frame to the server. No-op if socket is not open. */
  sendSignalMessage: (message: Record<string, unknown>) => void;
}

/**
 * Produces the signaling WebSocket URL for a given REST API base URL.
 * Pure so tests can lock the mapping without spinning a socket.
 */
export function signalingWsUrlFromApiBase(apiBase: string): string {
  const trimmed = apiBase.replace(/\/$/, "");
  if (trimmed.startsWith("https://")) {
    return `wss://${trimmed.slice("https://".length)}/signal`;
  }
  if (trimmed.startsWith("http://")) {
    return `ws://${trimmed.slice("http://".length)}/signal`;
  }
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) {
    return `${trimmed.replace(/\/signal$/, "")}/signal`;
  }
  // Fallback: assume same-origin path.
  return `${trimmed}/signal`;
}

/**
 * Opens the WebSocket signaling connection for a (slug, sessionId) pair and
 * surfaces the latest room summary the server has broadcast. The hook is a
 * no-op while either identifier is null so tests and unauthenticated views
 * never open a socket.
 */
export function useRoomSignaling(input: UseRoomSignalingInput): UseRoomSignalingState {
  const { apiBaseUrl, slug, sessionId } = input;

  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [latestRoomSummary, setLatestRoomSummary] = useState<RoomSummary | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [p2pAvailable, setP2pAvailable] = useState(false);
  const [removedFromRoom, setRemovedFromRoom] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onP2PMessageRef = useRef(input.onP2PMessage);
  onP2PMessageRef.current = input.onP2PMessage;

  /** Ping interval: 20s (well within the 5-minute reconnect window). */
  const PING_INTERVAL_MS = Math.floor(RECONNECT_WINDOW_MS / 15);

  // sendSignalMessage is stable across renders — it reads socketRef at call time.
  const sendSignalMessage = useRef((message: Record<string, unknown>) => {
    const sock = socketRef.current;
    if (sock == null || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(JSON.stringify(message));
    } catch {
      // Ignore; the close handler will clean up.
    }
  }).current;

  useEffect(() => {
    if (slug == null || sessionId == null) {
      setSignalState("idle");
      return;
    }

    if (typeof WebSocket === "undefined") {
      setSignalState("error");
      return;
    }

    const url = signalingWsUrlFromApiBase(apiBaseUrl);
    setSignalState("connecting");
    const socket = new WebSocket(url);
    socketRef.current = socket;

    const stopPing = () => {
      if (pingIntervalRef.current != null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const startPing = () => {
      stopPing();
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ kind: "room.ping" }));
          } catch {
            // Ignore; the close handler will clean up.
          }
        }
      }, PING_INTERVAL_MS);
    };

    socket.addEventListener("open", () => {
      try {
        socket.send(
          JSON.stringify({ kind: "room.connect", roomSlug: slug, sessionId }),
        );
      } catch {
        setSignalState("error");
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        const raw = JSON.parse(data) as { kind: string; [key: string]: unknown };
        if (raw.kind === "room.snapshot" || raw.kind === "room.settings_updated") {
          const parsed = raw as unknown as SignalServerEvent & { room: RoomSummary };
          setSignalState("connected");
          setLatestRoomSummary(parsed.room);
          // Start heartbeat once we're confirmed connected.
          startPing();
        } else if (raw.kind === "room.pong") {
          // Server acknowledged our ping; session is still alive. No state change needed.
        } else if (raw.kind === "transport.switch_available") {
          setP2pAvailable(true);
        } else if (raw.kind === "participant_removed") {
          const ev = raw as { kind: "participant_removed"; sessionId: string };
          if (ev.sessionId === sessionId) {
            setRemovedFromRoom(true);
          }
        } else if (raw.kind === "chat.received") {
          const msg = (raw as { kind: string; message: ChatMessage }).message;
          setChatMessages((prev) => [...prev, msg]);
        } else if (raw.kind === "p2p.offer" || raw.kind === "p2p.answer" || raw.kind === "p2p.ice") {
          onP2PMessageRef.current?.(raw as unknown as P2PSignalEvent);
        } else if (raw.kind === "error") {
          if (raw.code === "session_expired") {
            setSessionExpired(true);
          }
          setSignalState("error");
          stopPing();
        }
      } catch {
        // Drop unparseable frames; the next snapshot will re-hydrate state.
      }
    });

    socket.addEventListener("close", () => {
      stopPing();
      setSignalState((prev) => (prev === "error" ? prev : "closed"));
    });

    socket.addEventListener("error", () => {
      stopPing();
      setSignalState("error");
    });

    return () => {
      stopPing();
      try {
        socket.close();
      } catch {
        // Ignore; the socket may already be closing.
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [apiBaseUrl, slug, sessionId]);

  return { signalState, latestRoomSummary, sessionExpired, p2pAvailable, removedFromRoom, chatMessages, sendSignalMessage };
}
