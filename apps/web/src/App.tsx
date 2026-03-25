import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
  LobbyRequestStatusResponse,
  LobbyRequestSummary,
  MediaTokenResponse,
  QualityPreset,
  RequestedMedia,
  RoomSummary,
} from "@lowtime/shared";

import { CallPage } from "./features/call/call-page.js";
import { HomePage } from "./features/home/home-page.js";
import { RoomPage } from "./features/room/room-page.js";
import { WaitingPage } from "./features/waiting/waiting-page.js";
import {
  getFirstVideoTrack,
  getParticipant,
  getParticipantLabel,
  getPrimaryParticipant,
  type VideoTrackLike,
} from "./call-experience.js";
import { connectToSfu } from "./media-controller.js";
import { assessNetworkHealth, getNetworkHealthLabel, type NetworkHealth } from "./network-health.js";
import {
  buildPreviewConstraints,
  getPreviewStateMessage,
  getQualityPresetLabel,
  stopMediaStream,
  type PreviewState,
} from "./device-preview.js";
import {
  attachInstallPromptListeners,
  isPwaInstalled,
  promptForInstallation,
  type BeforeInstallPromptEvent,
} from "./pwa.js";
import {
  buildRequestedMedia,
  clearStoredCallSession,
  clearStoredLobbyRequest,
  getApiBaseUrl,
  getCallRoute,
  getViewState,
  getWaitingRoute,
  loadStoredHostSecret,
  loadStoredLobbyRequest,
  loadStoredCallSession,
  saveStoredHostSecret,
  saveStoredLobbyRequest,
  saveStoredCallSession,
  type StoredLobbyRequest,
  type StoredCallSession,
} from "./room-entry.js";

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";
const DEFAULT_REQUESTED_MEDIA: RequestedMedia = {
  audio: true,
  video: true,
};

export function App() {
  const [viewState, setViewState] = useState(() => getViewState(window.location.pathname));
  const [createResult, setCreateResult] = useState<CreateRoomResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [roomSummary, setRoomSummary] = useState<RoomSummary | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [selectedQualityPreset, setSelectedQualityPreset] = useState<QualityPreset>(DEFAULT_QUALITY_PRESET);
  const [previewAudioEnabled, setPreviewAudioEnabled] = useState(DEFAULT_REQUESTED_MEDIA.audio);
  const [previewVideoEnabled, setPreviewVideoEnabled] = useState(DEFAULT_REQUESTED_MEDIA.video);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [hostLobbyRequests, setHostLobbyRequests] = useState<LobbyRequestSummary[]>([]);
  const [hostLobbyError, setHostLobbyError] = useState<string | null>(null);
  const [waitingRequest, setWaitingRequest] = useState<StoredLobbyRequest | null>(null);
  const [waitingStatus, setWaitingStatus] = useState<LobbyRequestStatusResponse | null>(null);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  const [callSession, setCallSession] = useState<StoredCallSession | null>(null);
  const [callStatus, setCallStatus] = useState<"idle" | "requesting_token" | "connecting" | "connected">("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [callParticipants, setCallParticipants] = useState(0);
  const [connectedSfuUrl, setConnectedSfuUrl] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(DEFAULT_REQUESTED_MEDIA.audio);
  const [isCameraEnabled, setIsCameraEnabled] = useState(DEFAULT_REQUESTED_MEDIA.video);
  const [isTogglingMic, setIsTogglingMic] = useState(false);
  const [isTogglingCamera, setIsTogglingCamera] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState<VideoTrackLike | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<VideoTrackLike | null>(null);
  const [remoteParticipantLabel, setRemoteParticipantLabel] = useState<string>("Waiting for someone to join");
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>(() =>
    assessNetworkHealth({
      callStatus: "idle",
      isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    }),
  );
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [isInstallingApp, setIsInstallingApp] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(() => getStandaloneAppState());
  const hostSecret = useMemo(
    () => (viewState.kind === "home" ? null : loadStoredHostSecret(window.localStorage, viewState.slug)),
    [viewState],
  );

  const apiBaseUrl = useMemo(
    () => getApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location),
    [],
  );

  const callRoomRef = useRef<Awaited<ReturnType<typeof connectToSfu>> | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setViewState(getViewState(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    setIsStandaloneApp(getStandaloneAppState());

    return attachInstallPromptListeners(window, {
      onPromptAvailable: (event) => {
        setDeferredInstallPrompt(event);
        setInstallMessage("Install LowTime for faster access from your home screen.");
      },
      onInstalled: () => {
        setDeferredInstallPrompt(null);
        setIsInstallingApp(false);
        setIsStandaloneApp(true);
        setInstallMessage("LowTime is installed and ready to launch like an app.");
      },
    });
  }, []);

  useEffect(() => {
    const connection = getNavigatorConnection();

    const syncNetworkHealth = () => {
      setNetworkHealth(
        assessNetworkHealth({
          callStatus,
          isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
          effectiveType: connection?.effectiveType,
          rtt: connection?.rtt,
        }),
      );
    };

    syncNetworkHealth();

    window.addEventListener("online", syncNetworkHealth);
    window.addEventListener("offline", syncNetworkHealth);
    connection?.addEventListener?.("change", syncNetworkHealth);

    return () => {
      window.removeEventListener("online", syncNetworkHealth);
      window.removeEventListener("offline", syncNetworkHealth);
      connection?.removeEventListener?.("change", syncNetworkHealth);
    };
  }, [callStatus]);

  useEffect(() => {
    if (viewState.kind === "room" || viewState.kind === "waiting") {
      return;
    }

    setRoomSummary(null);
    setRoomError(null);
    setJoinError(null);
    setJoinResult(null);
    setDisplayName("");
    setSelectedQualityPreset(DEFAULT_QUALITY_PRESET);
    setPreviewAudioEnabled(DEFAULT_REQUESTED_MEDIA.audio);
    setPreviewVideoEnabled(DEFAULT_REQUESTED_MEDIA.video);
    setPreviewState("idle");
    setPreviewError(null);
    setIsLoadingRoom(false);
    setHostLobbyRequests([]);
    setHostLobbyError(null);
    setWaitingRequest(null);
    setWaitingStatus(null);
    setWaitingError(null);
    stopMediaStream(previewStreamRef.current);
    previewStreamRef.current = null;
  }, [viewState]);

  useEffect(() => {
    const videoElement = previewVideoRef.current;
    const stream = previewStreamRef.current;

    if (videoElement == null) {
      return;
    }

    videoElement.srcObject = stream;

    return () => {
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
    };
  }, [previewState, previewVideoEnabled]);

  useEffect(() => {
    if (viewState.kind !== "room" && viewState.kind !== "waiting") {
      return;
    }

    const slug = viewState.slug;
    const abortController = new AbortController();

    async function loadRoom() {
      setIsLoadingRoom(true);
      setRoomError(null);
      setJoinError(null);
      setJoinResult(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/rooms/${slug}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Unable to load room");
        }

        const payload = (await response.json()) as RoomSummary;
        setRoomSummary(payload);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setRoomSummary(null);
        setRoomError(error instanceof Error ? error.message : "Unable to load room");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingRoom(false);
        }
      }
    }

    void loadRoom();

    return () => {
      abortController.abort();
    };
  }, [apiBaseUrl, viewState]);

  useEffect(() => {
    if (viewState.kind !== "waiting") {
      return;
    }

    const storedRequest = loadStoredLobbyRequest(window.sessionStorage, viewState.slug);

    if (storedRequest == null || storedRequest.requestId !== viewState.requestId) {
      setWaitingRequest(null);
      setWaitingStatus(null);
      setWaitingError("Missing waiting-room session. Rejoin from the room page.");
      return;
    }

    setWaitingRequest(storedRequest);
    setWaitingError(null);

    let cancelled = false;
    let timerId: number | undefined;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/rooms/${viewState.slug}/lobby/${viewState.requestId}`);

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Unable to load waiting-room status");
        }

        const payload = (await response.json()) as LobbyRequestStatusResponse;

        if (cancelled) {
          return;
        }

        setWaitingStatus(payload);

        if (payload.status === "approved") {
          saveStoredCallSession(window.sessionStorage, viewState.slug, {
            sessionId: payload.sessionId,
            displayName: storedRequest.displayName,
            qualityPreset: storedRequest.qualityPreset,
            transportPreference: payload.transportPreference,
            requestedMedia: storedRequest.requestedMedia,
          });
          clearStoredLobbyRequest(window.sessionStorage, viewState.slug);
          window.history.pushState({}, "", getCallRoute(viewState.slug));
          setViewState(getViewState(window.location.pathname));
          return;
        }

        if (payload.status === "waiting") {
          timerId = window.setTimeout(() => {
            void pollStatus();
          }, 3000);
        }
      } catch (error) {
        if (!cancelled) {
          setWaitingError(error instanceof Error ? error.message : "Unable to load waiting-room status");
        }
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [apiBaseUrl, viewState]);

  useEffect(() => {
    if (viewState.kind !== "room" || roomSummary?.accessMode !== "lobby" || hostSecret == null) {
      setHostLobbyRequests([]);
      setHostLobbyError(null);
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    const loadLobbyRequests = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/rooms/${viewState.slug}/lobby`, {
          headers: {
            "x-host-secret": hostSecret,
          },
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Unable to load lobby requests");
        }

        const payload = (await response.json()) as { requests: LobbyRequestSummary[] };

        if (!cancelled) {
          setHostLobbyRequests(payload.requests);
          setHostLobbyError(null);
          timerId = window.setTimeout(() => {
            void loadLobbyRequests();
          }, 3000);
        }
      } catch (error) {
        if (!cancelled) {
          setHostLobbyError(error instanceof Error ? error.message : "Unable to load lobby requests");
        }
      }
    };

    void loadLobbyRequests();

    return () => {
      cancelled = true;
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [apiBaseUrl, hostSecret, roomSummary?.accessMode, viewState]);

  useEffect(() => {
    if (viewState.kind !== "call") {
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

    const storedSession = loadStoredCallSession(window.sessionStorage, viewState.slug);

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
  }, [viewState]);

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
    if (viewState.kind !== "call" || callSession == null) {
      return;
    }

    const callSlug = viewState.slug;
    const activeCallSession = callSession;
    let cancelled = false;
    let removeRoomListeners = () => {};

    async function connectCall() {
      setCallStatus("requesting_token");
      setCallError(null);
      setConnectedSfuUrl(null);

      try {
        const tokenResponse = await fetch(`${apiBaseUrl}/api/rooms/${callSlug}/token`, {
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
  }, [apiBaseUrl, callSession, viewState]);

  async function handleCreateRoom() {
    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Unable to create room");
      }

      const payload = (await response.json()) as CreateRoomResponse;
      setCreateResult(payload);
      saveStoredHostSecret(window.localStorage, payload.roomSlug, payload.hostSecret);
    } catch (error) {
      setCreateResult(null);
      setCreateError(error instanceof Error ? error.message : "Unable to create room");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopyLink() {
    if (createResult == null) {
      return;
    }

    await navigator.clipboard.writeText(toAbsoluteJoinUrl(createResult.joinUrl));
  }

  async function handleInstallApp() {
    if (deferredInstallPrompt == null) {
      return;
    }

    setIsInstallingApp(true);

    try {
      const outcome = await promptForInstallation(deferredInstallPrompt);
      setDeferredInstallPrompt(null);
      setInstallMessage(
        outcome === "accepted"
          ? "Install accepted. Your browser will finish adding LowTime."
          : "Install dismissed. You can still add LowTime from your browser menu later.",
      );
    } finally {
      setIsInstallingApp(false);
    }
  }

  function handleOpenRoom() {
    if (createResult == null) {
      return;
    }

    window.history.pushState({}, "", createResult.joinUrl);
    setViewState(getViewState(window.location.pathname));
  }

  async function handleJoinRoom() {
    if (viewState.kind !== "room") {
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setJoinResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/rooms/${viewState.slug}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          qualityPreset: selectedQualityPreset,
          requestedMedia: buildRequestedMedia(previewAudioEnabled, previewVideoEnabled),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Unable to join room");
      }

      const payload = (await response.json()) as JoinRoomResponse;
      setJoinResult(payload);

      if (payload.joinState === "direct") {
        saveStoredCallSession(window.sessionStorage, viewState.slug, {
          sessionId: payload.sessionId,
          displayName: displayName.trim(),
          qualityPreset: selectedQualityPreset,
          transportPreference: payload.transportPreference,
          requestedMedia: buildRequestedMedia(previewAudioEnabled, previewVideoEnabled),
        });

        stopMediaStream(previewStreamRef.current);
        previewStreamRef.current = null;
        window.history.pushState({}, "", getCallRoute(viewState.slug));
        setViewState(getViewState(window.location.pathname));
      } else if (payload.joinState === "waiting") {
        const storedRequest: StoredLobbyRequest = {
          requestId: payload.requestId,
          displayName: displayName.trim(),
          qualityPreset: selectedQualityPreset,
          requestedMedia: buildRequestedMedia(previewAudioEnabled, previewVideoEnabled),
        };

        saveStoredLobbyRequest(window.sessionStorage, viewState.slug, storedRequest);
        window.history.pushState({}, "", getWaitingRoute(viewState.slug, payload.requestId));
        setViewState(getViewState(window.location.pathname));
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Unable to join room");
    } finally {
      setIsJoining(false);
    }
  }

  function handleLeaveCall() {
    if (viewState.kind !== "call") {
      return;
    }

    callRoomRef.current?.disconnect();
    callRoomRef.current = null;
    clearStoredCallSession(window.sessionStorage, viewState.slug);
    window.history.pushState({}, "", `/r/${viewState.slug}`);
    setViewState(getViewState(window.location.pathname));
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

  async function handleStartPreview() {
    if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia == null) {
      setPreviewState("error");
      setPreviewError("This browser does not support live device preview.");
      return;
    }

    setPreviewState("requesting");
    setPreviewError(null);

    try {
      const requestedMedia = buildRequestedMedia(previewAudioEnabled, previewVideoEnabled);
      const stream = await navigator.mediaDevices.getUserMedia(buildPreviewConstraints(requestedMedia));
      stopMediaStream(previewStreamRef.current);
      previewStreamRef.current = stream;
      setPreviewState("ready");
    } catch (error) {
      stopMediaStream(previewStreamRef.current);
      previewStreamRef.current = null;

      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPreviewState("blocked");
        setPreviewError("Camera or microphone access was blocked. Adjust browser permissions to preview devices.");
      } else {
        setPreviewState("error");
        setPreviewError(error instanceof Error ? error.message : "Unable to start device preview.");
      }
    }
  }

  async function handleHostLobbyAction(requestId: string, action: "approve" | "deny") {
    if (viewState.kind !== "room" || hostSecret == null) {
      return;
    }

    setHostLobbyError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/rooms/${viewState.slug}/lobby/${requestId}/${action}`, {
        method: "POST",
        headers: {
          "x-host-secret": hostSecret,
        },
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? `Unable to ${action} lobby request`);
      }

      setHostLobbyRequests((current) => current.filter((entry) => entry.requestId !== requestId));
    } catch (error) {
      setHostLobbyError(error instanceof Error ? error.message : `Unable to ${action} lobby request`);
    }
  }

  if (viewState.kind === "call") {
    return (
      <CallPage
        callError={callError}
        callParticipants={callParticipants}
        callSession={callSession}
        callStatus={callStatus}
        connectedSfuUrl={connectedSfuUrl}
        hasLocalVideo={localVideoTrack != null}
        hasRemoteVideo={remoteVideoTrack != null}
        isCameraEnabled={isCameraEnabled}
        isMicEnabled={isMicEnabled}
        isTogglingCamera={isTogglingCamera}
        isTogglingMic={isTogglingMic}
        localVideoRef={localVideoRef}
        networkHealth={networkHealth}
        remoteParticipantLabel={remoteParticipantLabel}
        remoteVideoRef={remoteVideoRef}
        slug={viewState.slug}
        onBackToJoin={() => {
          window.history.pushState({}, "", `/r/${viewState.slug}`);
          setViewState(getViewState(window.location.pathname));
        }}
        onLeaveCall={handleLeaveCall}
        onToggleCamera={handleToggleCamera}
        onToggleMicrophone={handleToggleMicrophone}
      />
    );
  }

  if (viewState.kind === "waiting") {
    return (
      <WaitingPage
        slug={viewState.slug}
        waitingError={waitingError}
        waitingRequest={waitingRequest}
        waitingStatus={waitingStatus}
        onBackToJoin={() => {
          clearStoredLobbyRequest(window.sessionStorage, viewState.slug);
          window.history.pushState({}, "", `/r/${viewState.slug}`);
          setViewState(getViewState(window.location.pathname));
        }}
      />
    );
  }

  if (viewState.kind === "room") {
    return (
      <RoomPage
        displayName={displayName}
        hostLobbyError={hostLobbyError}
        hostLobbyRequests={hostLobbyRequests}
        hostSecret={hostSecret}
        isJoining={isJoining}
        isLoadingRoom={isLoadingRoom}
        joinError={joinError}
        joinResult={joinResult}
        previewAudioEnabled={previewAudioEnabled}
        previewError={previewError}
        previewState={previewState}
        previewVideoEnabled={previewVideoEnabled}
        previewVideoRef={previewVideoRef}
        roomError={roomError}
        roomSummary={roomSummary}
        selectedQualityPreset={selectedQualityPreset}
        slug={viewState.slug}
        onDisplayNameChange={setDisplayName}
        onHostLobbyAction={handleHostLobbyAction}
        onJoinRoom={handleJoinRoom}
        onPreviewAudioChange={setPreviewAudioEnabled}
        onPreviewVideoChange={setPreviewVideoEnabled}
        onQualityPresetChange={setSelectedQualityPreset}
        onStartPreview={handleStartPreview}
      />
    );
  }

  return (
    <HomePage
      createError={createError}
      createResult={createResult}
      isCreating={isCreating}
      isInstallingApp={isInstallingApp}
      isStandaloneApp={isStandaloneApp}
      installMessage={installMessage}
      shareUrl={createResult ? toAbsoluteJoinUrl(createResult.joinUrl) : null}
      showInstallPrompt={deferredInstallPrompt != null}
      onCopyLink={handleCopyLink}
      onCreateRoom={handleCreateRoom}
      onInstallApp={handleInstallApp}
      onOpenRoom={handleOpenRoom}
    />
  );
}

function toAbsoluteJoinUrl(joinUrl: string): string {
  return new URL(joinUrl, window.location.origin).toString();
}

interface NavigatorConnectionLike extends EventTarget {
  effectiveType?: string;
  rtt?: number;
}

function getNavigatorConnection(): NavigatorConnectionLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidate = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };

  return candidate.connection ?? candidate.mozConnection ?? candidate.webkitConnection ?? null;
}

function getStandaloneAppState(): boolean {
  return isPwaInstalled({
    matchMedia: typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined,
    navigator,
  });
}
