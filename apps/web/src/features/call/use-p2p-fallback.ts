import { useCallback, useRef, useState } from "react";

import type { P2PSessionConfig, P2PTokenResponse } from "@lowtime/shared";

import type { P2PSignalEvent } from "../room/room-signaling.js";

export type P2PCallStatus =
  | "idle"
  | "requesting_token"
  | "negotiating"
  | "connected"
  | "failed";

export interface UseP2PFallbackInput {
  apiBaseUrl: string;
  slug: string;
  sessionId: string;
  /** Injected send function from useRoomSignaling. */
  sendSignalMessage: (message: Record<string, unknown>) => void;
  localStream: MediaStream | null;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export interface UseP2PFallbackState {
  p2pStatus: P2PCallStatus;
  p2pError: string | null;
}

export interface UseP2PFallbackActions {
  /** Called by call-effects when SFU fails and the room is 1:1. */
  initiateFallback: () => void;
  /** Called by useRoomSignaling's onP2PMessage callback. */
  handleP2PMessage: (event: P2PSignalEvent) => void;
  cleanup: () => void;
}

/**
 * Manages the WebRTC P2P fallback connection lifecycle for a 1:1 room.
 *
 * State machine:
 *   idle → requesting_token → negotiating → connected
 *                                         → failed
 */
export function useP2PFallback(
  input: UseP2PFallbackInput,
): UseP2PFallbackState & UseP2PFallbackActions {
  const [p2pStatus, setP2pStatus] = useState<P2PCallStatus>("idle");
  const [p2pError, setP2pError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionConfigRef = useRef<P2PSessionConfig | null>(null);
  // Buffer ICE candidates that arrive before the remote description is set.
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const inputRef = useRef(input);
  inputRef.current = input;

  const createPeerConnection = useCallback((iceServers: RTCIceServer[]) => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate != null) {
        inputRef.current.sendSignalMessage({
          kind: "p2p.ice",
          payload: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setP2pStatus("connected");
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setP2pStatus("failed");
        setP2pError("P2P connection failed. Please rejoin.");
      }
    };

    pc.ontrack = (event) => {
      const videoEl = inputRef.current.remoteVideoRef.current;
      if (videoEl != null && event.streams.length > 0) {
        videoEl.srcObject = event.streams[0] ?? null;
      }
    };

    // Add local media tracks.
    const localStream = inputRef.current.localStream;
    if (localStream != null) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  const initiateFallback = useCallback(() => {
    setP2pStatus("requesting_token");
    setP2pError(null);
    pendingIceCandidatesRef.current = [];

    const { apiBaseUrl, slug, sessionId } = inputRef.current;

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/rooms/${slug}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, transportPreference: "p2p" }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { message?: string };
          throw new Error(body.message ?? "Failed to obtain P2P token");
        }

        const tokenResponse = (await response.json()) as P2PTokenResponse;
        const config = tokenResponse.p2pSession;
        sessionConfigRef.current = config;

        setP2pStatus("negotiating");

        if (config.offerRole === "caller") {
          const pc = createPeerConnection(config.iceServers as RTCIceServer[]);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          inputRef.current.sendSignalMessage({
            kind: "p2p.offer",
            payload: { sdp: offer.sdp ?? "" },
          });
        }
        // Callee waits for p2p.offer via handleP2PMessage.
      } catch (error) {
        setP2pStatus("failed");
        setP2pError(error instanceof Error ? error.message : "P2P token request failed");
      }
    })();
  }, [createPeerConnection]);

  const handleP2PMessage = useCallback(
    (event: P2PSignalEvent) => {
      void (async () => {
        try {
          if (event.kind === "p2p.offer") {
            // Callee path: receive offer, create answer.
            const config = sessionConfigRef.current;
            if (config == null) return;

            const pc = createPeerConnection(config.iceServers as RTCIceServer[]);
            await pc.setRemoteDescription({ type: "offer", sdp: event.payload.sdp });

            // Drain any buffered ICE candidates.
            for (const candidate of pendingIceCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingIceCandidatesRef.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            inputRef.current.sendSignalMessage({
              kind: "p2p.answer",
              payload: { sdp: answer.sdp ?? "" },
            });
          } else if (event.kind === "p2p.answer") {
            // Caller path: receive answer.
            const pc = peerConnectionRef.current;
            if (pc == null) return;
            await pc.setRemoteDescription({ type: "answer", sdp: event.payload.sdp });

            // Drain any buffered ICE candidates.
            for (const candidate of pendingIceCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingIceCandidatesRef.current = [];
          } else if (event.kind === "p2p.ice") {
            const pc = peerConnectionRef.current;
            if (pc == null || pc.remoteDescription == null) {
              // Buffer until remote description is set.
              pendingIceCandidatesRef.current.push(event.payload);
              return;
            }
            await pc.addIceCandidate(event.payload);
          }
        } catch (error) {
          setP2pStatus("failed");
          setP2pError(error instanceof Error ? error.message : "P2P negotiation error");
        }
      })();
    },
    [createPeerConnection],
  );

  const cleanup = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    sessionConfigRef.current = null;
    pendingIceCandidatesRef.current = [];
    setP2pStatus("idle");
    setP2pError(null);
  }, []);

  return { p2pStatus, p2pError, initiateFallback, handleP2PMessage, cleanup };
}
