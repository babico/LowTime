import { useEffect, useRef, useState } from "react";

import type { MediaTokenResponse } from "@lowtime/shared";

import {
  getFirstVideoTrack,
  getParticipant,
  getParticipantLabel,
  getPrimaryParticipant,
  type VideoTrackLike,
} from "../../call-experience.js";
import { connectToSfu } from "../../media-controller.js";
import {
  clearStoredCallSession,
  getViewState,
  loadStoredCallSession,
  type StoredCallSession,
  type ViewState,
} from "../../room-entry.js";
import { removeParticipantRequest } from "../../host-actions.js";
import type { P2PCallStatus } from "./use-p2p-fallback.js";
import { useP2PFallback } from "./use-p2p-fallback.js";

const DEFAULT_REQUESTED_MEDIA = {
  audio: true,
  video: true,
} as const;

interface UseCallFlowInput {
  apiBaseUrl: string;
  setViewState: (viewState: ViewState) => void;
  hostSecret: string | null;
  isHost: boolean;
  removedFromRoomRef: { current: boolean };
  viewState: ViewState;
  /** Injected from useRoomSignaling to send P2P signal messages. */
  sendSignalMessage?: (message: Record<string, unknown>) => void;
  /** Room's maxParticipants — used to decide whether P2P fallback is available. */
  maxParticipants?: number;
}

export function useCallFlow(input: UseCallFlowInput) {
  const [callSession, setCallSession] = useState<StoredCallSession | null>(null);
  const [callStatus, setCallStatus] = useState<"idle" | "requesting_token" | "connecting" | "connected">("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [callParticipants, setCallParticipants] = useState(0);
  const [connectedSfuUrl, setConnectedSfuUrl] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(DEFAULT_REQUESTED_MEDIA.audio);
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(DEFAULT_REQUESTED_MEDIA.video);
  const [isTogglingMic, setIsTogglingMic] = useState(false);
  const [isTogglingCamera, setIsTogglingCamera] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState<VideoTrackLike | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<VideoTrackLike | null>(null);
  const [remoteParticipantLabel, setRemoteParticipantLabel] = useState<string>("Waiting for someone to join");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isRemovingParticipant, setIsRemovingParticipant] = useState<string | null>(null);

  const callRoomRef = useRef<Awaited<ReturnType<typeof connectToSfu>> | null>(null);
  const [callRoom, setCallRoom] = useState<Awaited<ReturnType<typeof connectToSfu>> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const slug = input.viewState.kind === "call" ? input.viewState.slug : "";
  const sessionId = callSession?.sessionId ?? "";

  useEffect(() => {
    if (!input.removedFromRoomRef.current) {
      return;
    }
    if (callRoomRef.current == null) {
      return;
    }
    callRoomRef.current.disconnect();
    callRoomRef.current = null;
    setCallRoom(null);
    setCallStatus("idle");
    setCallError("The host removed you from this call.");
  }, [input.removedFromRoomRef.current]);

  const p2pFallback = useP2PFallback({
    apiBaseUrl: input.apiBaseUrl,
    slug,
    sessionId,
    sendSignalMessage: input.sendSignalMessage ?? (() => {}),
    localStream,
    remoteVideoRef,
  });

  useEffect(() => {
    if (input.viewState.kind !== "call") {
      setCallSession(null);
      setCallStatus("idle");
      setCallError(null);
      setCallParticipants(0);
      setConnectedSfuUrl(null);
      setIsMicEnabled(DEFAULT_REQUESTED_MEDIA.audio);
      setIsCameraEnabled(DEFAULT_REQUESTED_MEDIA.video);
      setIsTogglingMic(false);
      setIsTogglingCamera(false);
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
      setRemoteParticipantLabel("Waiting for someone to join");
      setLocalStream(null);
      callRoomRef.current?.disconnect();
      callRoomRef.current = null;
      setCallRoom(null);
      return;
    }

    const storedSession = loadStoredCallSession(window.sessionStorage, input.viewState.slug);

    if (storedSession == null) {
      setCallSession(null);
      setCallStatus("idle");
      setCallError("Missing local call session. Rejoin from the room page.");
      return;
    }

    setCallSession(storedSession);
    setCallError(null);
    setIsMicEnabled(storedSession.requestedMedia.audio);
    setIsCameraEnabled(storedSession.requestedMedia.video);
  }, [input.viewState]);

  useEffect(() => {
    const videoElement = localVideoRef.current;

    if (videoElement == null || localVideoTrack == null) {
      return;
    }

    const attachedTrack = localVideoTrack;
    attachedTrack.attach(videoElement);

    return () => {
      attachedTrack.detach(videoElement);
    };
  }, [localVideoTrack]);

  useEffect(() => {
    const videoElement = remoteVideoRef.current;

    if (videoElement == null || remoteVideoTrack == null) {
      return;
    }

    const attachedTrack = remoteVideoTrack;
    attachedTrack.attach(videoElement);

    return () => {
      attachedTrack.detach(videoElement);
    };
  }, [remoteVideoTrack]);

  useEffect(() => {
    if (input.viewState.kind !== "call" || callSession == null) {
      return;
    }

    const callSlug = input.viewState.slug;
    const activeCallSession = callSession;
    let cancelled = false;
    let removeRoomListeners = () => {};

    async function connectCall() {
      setCallStatus("requesting_token");
      setCallError(null);
      setConnectedSfuUrl(null);

      try {
        const tokenResponse = await fetch(`${input.apiBaseUrl}/api/rooms/${callSlug}/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeCallSession.sessionId,
            transportPreference: activeCallSession.transportPreference,
          }),
        });

        if (!tokenResponse.ok) {
          const payload = (await tokenResponse.json()) as { message?: string };
          const errorMessage = payload.message ?? "Unable to request media token";

          // If SFU is not configured and this is a 1:1 room, try P2P fallback.
          if (tokenResponse.status === 503 && (input.maxParticipants ?? 0) === 2) {
            if (!cancelled) {
              p2pFallback.initiateFallback();
            }
            return;
          }

          throw new Error(errorMessage);
        }

        const credentials = (await tokenResponse.json()) as MediaTokenResponse;

        if (credentials.transport !== "sfu") {
          // Non-SFU token received — try P2P if 1:1 room.
          if (credentials.transport === "p2p" && (input.maxParticipants ?? 0) === 2) {
            if (!cancelled) {
              p2pFallback.initiateFallback();
            }
            return;
          }
          throw new Error("Only SFU transport is currently supported in the web client");
        }

        if (cancelled) {
          return;
        }

        setCallStatus("connecting");

        let room: Awaited<ReturnType<typeof connectToSfu>>;
        try {
          room = await connectToSfu({
            credentials,
            requestedMedia: activeCallSession.requestedMedia,
            qualityPreset: activeCallSession.qualityPreset,
            advancedPrefs: activeCallSession.advancedPrefs,
          });
        } catch (sfuError) {
          // SFU connection failed — try P2P fallback for 1:1 rooms.
          if ((input.maxParticipants ?? 0) === 2 && !cancelled) {
            p2pFallback.initiateFallback();
            return;
          }
          throw sfuError;
        }

        if (cancelled) {
          room.disconnect();
          return;
        }

        // Capture local stream for potential P2P fallback.
        try {
          const localTracks = room.localParticipant.videoTrackPublications;
          if (localTracks.size > 0) {
            const firstPub = localTracks.values().next().value;
            if (firstPub?.track?.mediaStreamTrack != null) {
              const stream = new MediaStream([firstPub.track.mediaStreamTrack]);
              setLocalStream(stream);
            }
          }
        } catch {
          // Non-critical; P2P fallback will work without pre-captured stream.
        }

        const syncCallPresentation = () => {
          const nextRemoteParticipant = getPrimaryParticipant(room.remoteParticipants.values());
          const nextLocalParticipant = getParticipant(room.localParticipant);

          setCallParticipants(room.remoteParticipants.size + 1);
          setLocalVideoTrack(getFirstVideoTrack(nextLocalParticipant));
          setRemoteVideoTrack(getFirstVideoTrack(nextRemoteParticipant));
          setRemoteParticipantLabel(getParticipantLabel(nextRemoteParticipant, "Waiting for someone to join"));
        };

        const handleDisconnected = () => {
          setCallStatus("idle");
          setRemoteVideoTrack(null);
          setLocalVideoTrack(null);
          setRemoteParticipantLabel("Waiting for someone to join");
        };

        room.on("participantConnected", syncCallPresentation);
        room.on("participantDisconnected", syncCallPresentation);
        room.on("trackSubscribed", syncCallPresentation);
        room.on("trackUnsubscribed", syncCallPresentation);
        room.on("trackMuted", syncCallPresentation);
        room.on("trackUnmuted", syncCallPresentation);
        room.on("localTrackPublished", syncCallPresentation);
        room.on("localTrackUnpublished", syncCallPresentation);
        room.on("disconnected", handleDisconnected);

        removeRoomListeners = () => {
          room.off("participantConnected", syncCallPresentation);
          room.off("participantDisconnected", syncCallPresentation);
          room.off("trackSubscribed", syncCallPresentation);
          room.off("trackUnsubscribed", syncCallPresentation);
          room.off("trackMuted", syncCallPresentation);
          room.off("trackUnmuted", syncCallPresentation);
          room.off("localTrackPublished", syncCallPresentation);
          room.off("localTrackUnpublished", syncCallPresentation);
          room.off("disconnected", handleDisconnected);
        };

        callRoomRef.current?.disconnect();
        callRoomRef.current = room;
        setCallRoom(room);
        setConnectedSfuUrl(credentials.sfuUrl);
        syncCallPresentation();
        setCallStatus("connected");
      } catch (error) {
        if (!cancelled) {
          setCallStatus("idle");
          setCallError(error instanceof Error ? error.message : "Unable to connect to the SFU");
        }
      }
    }

    void connectCall();

    return () => {
      cancelled = true;
      removeRoomListeners();
      callRoomRef.current?.disconnect();
      callRoomRef.current = null;
      setCallRoom(null);
    };
  }, [input.apiBaseUrl, callSession, input.viewState]);

  function handleLeaveCall() {
    if (input.viewState.kind !== "call") {
      return;
    }

    p2pFallback.cleanup();
    callRoomRef.current?.disconnect();
    callRoomRef.current = null;
    setCallRoom(null);
    clearStoredCallSession(window.sessionStorage, input.viewState.slug);
    window.history.pushState({}, "", `/r/${input.viewState.slug}`);
    input.setViewState(getViewState(window.location.pathname));
  }

  async function handleToggleMicrophone() {
    if (callRoomRef.current == null) {
      return;
    }

    const nextValue = !isMicEnabled;
    setIsTogglingMic(true);
    setCallError(null);

    try {
      await callRoomRef.current.localParticipant.setMicrophoneEnabled(nextValue);
      setIsMicEnabled(nextValue);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to update microphone state");
    } finally {
      setIsTogglingMic(false);
    }
  }

  async function handleToggleCamera() {
    if (callRoomRef.current == null) {
      return;
    }

    const nextValue = !isCameraEnabled;
    setIsTogglingCamera(true);
    setCallError(null);

    try {
      const room = callRoomRef.current;

      await room.localParticipant.setCameraEnabled(nextValue);
      setIsCameraEnabled(nextValue);
      const nextLocalParticipant = getParticipant(room.localParticipant);
      setLocalVideoTrack(nextValue ? getFirstVideoTrack(nextLocalParticipant) : null);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to update camera state");
    } finally {
      setIsTogglingCamera(false);
    }
  }

  /** Callback to pass to useRoomSignaling's onP2PMessage. */
  const handleP2PMessage = p2pFallback.handleP2PMessage;

  async function handleRemoveParticipant(targetSessionId: string) {
    if (!input.isHost || input.hostSecret == null || input.hostSecret === "") {
      setCallError("Only the host can remove participants.");
      return;
    }

    if (input.viewState.kind !== "call") {
      return;
    }

    setIsRemovingParticipant(targetSessionId);
    setCallError(null);

    const result = await removeParticipantRequest({
      apiBaseUrl: input.apiBaseUrl,
      slug: input.viewState.slug,
      sessionId: targetSessionId,
      hostSecret: input.hostSecret,
    });

    if (!result.ok) {
      setCallError(result.message);
    }

    setIsRemovingParticipant(null);
  }

  return {
    callError,
    callParticipants,
    callRoom,
    callSession,
    callStatus,
    connectedSfuUrl,
    handleLeaveCall,
    handleP2PMessage,
    handleRemoveParticipant,
    handleToggleCamera,
    handleToggleMicrophone,
    isCameraEnabled,
    isMicEnabled,
    isRemovingParticipant,
    isTogglingCamera,
    isTogglingMic,
    localVideoRef,
    localVideoTrack,
    p2pError: p2pFallback.p2pError,
    p2pStatus: p2pFallback.p2pStatus,
    remoteParticipantLabel,
    remoteVideoRef,
    remoteVideoTrack,
  };
}

export type { P2PCallStatus };
