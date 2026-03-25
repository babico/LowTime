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

const DEFAULT_REQUESTED_MEDIA = {
  audio: true,
  video: true,
} as const;

interface UseCallFlowInput {
  apiBaseUrl: string;
  setViewState: (viewState: ViewState) => void;
  viewState: ViewState;
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

  const callRoomRef = useRef<Awaited<ReturnType<typeof connectToSfu>> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

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
      callRoomRef.current?.disconnect();
      callRoomRef.current = null;
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
          throw new Error(payload.message ?? "Unable to request media token");
        }

        const credentials = (await tokenResponse.json()) as MediaTokenResponse;

        if (credentials.transport !== "sfu") {
          throw new Error("Only SFU transport is currently supported in the web client");
        }

        if (cancelled) {
          return;
        }

        setCallStatus("connecting");

        const room = await connectToSfu({
          credentials,
          requestedMedia: activeCallSession.requestedMedia,
        });

        if (cancelled) {
          room.disconnect();
          return;
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
    };
  }, [input.apiBaseUrl, callSession, input.viewState]);

  function handleLeaveCall() {
    if (input.viewState.kind !== "call") {
      return;
    }

    callRoomRef.current?.disconnect();
    callRoomRef.current = null;
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

  return {
    callError,
    callParticipants,
    callSession,
    callStatus,
    connectedSfuUrl,
    handleLeaveCall,
    handleToggleCamera,
    handleToggleMicrophone,
    isCameraEnabled,
    isMicEnabled,
    isTogglingCamera,
    isTogglingMic,
    localVideoRef,
    localVideoTrack,
    remoteParticipantLabel,
    remoteVideoRef,
    remoteVideoTrack,
  };
}
