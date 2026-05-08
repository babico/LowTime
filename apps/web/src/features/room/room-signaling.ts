import { useEffect, useRef, useState } from "react";

import type { RoomSummary } from "@lowtime/shared";
import { RECONNECT_WINDOW_MS } from "@lowtime/shared";

export type SignalState = "idle" | "connecting" | "connected" | "error" | "closed";

export type SignalServerEvent =
  | { kind: "room.snapshot"; room: RoomSummary }
  | { kind: "room.settings_updated"; room: RoomSummary }
  | { kind: "error"; code: string; message: string };

export interface UseRoomSignalingInput {
  apiBaseUrl: string;
  slug: string | null;
  sessionId: string | null;
}

export interface UseRoomSignalingState {
  signalState: SignalState;
  latestRoomSummary: RoomSummary | null;
  /** True when the server has indicated the session has expired and the user must rejoin. */
  sessionExpired: boolean;
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
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Ping interval: 20s (well within the 5-minute reconnect window). */
  const PING_INTERVAL_MS = Math.floor(RECONNECT_WINDOW_MS / 15);

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

  return { signalState, latestRoomSummary, sessionExpired };
}
