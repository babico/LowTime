import { useEffect, useRef, useState } from "react";

import type { RoomSummary } from "@lowtime/shared";

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
  const socketRef = useRef<WebSocket | null>(null);

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
        const parsed = JSON.parse(data) as SignalServerEvent;
        if (parsed.kind === "room.snapshot" || parsed.kind === "room.settings_updated") {
          setSignalState("connected");
          setLatestRoomSummary(parsed.room);
        } else if (parsed.kind === "error") {
          setSignalState("error");
        }
      } catch {
        // Drop unparseable frames; the next snapshot will re-hydrate state.
      }
    });

    socket.addEventListener("close", () => {
      setSignalState((prev) => (prev === "error" ? prev : "closed"));
    });

    socket.addEventListener("error", () => {
      setSignalState("error");
    });

    return () => {
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

  return { signalState, latestRoomSummary };
}
