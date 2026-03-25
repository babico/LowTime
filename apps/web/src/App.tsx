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
      <main style={callPageStyle}>
        <section style={callHeaderStyle}>
          <div>
            <h1>LowTime</h1>
            <p style={mutedParagraphStyle}>Room <code>{viewState.slug}</code></p>
          </div>
          <div style={callHeaderBadgeRowStyle}>
            <div style={networkBadgeStyle(networkHealth)}>
              {getNetworkHealthLabel(networkHealth)}
            </div>
            <div style={callStatusBadgeStyle(callStatus)}>
              {callStatus.replace("_", " ")}
            </div>
          </div>
        </section>
        {callSession ? (
          <section style={callLayoutStyle}>
            <section style={remoteTileStyle}>
              <div style={tileHeaderStyle}>
                <h2 style={tileHeadingStyle}>Remote</h2>
                <span>{remoteParticipantLabel}</span>
              </div>
              {remoteVideoTrack ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={remoteVideoStyle}
                />
              ) : (
                <div style={tilePlaceholderStyle}>
                  <strong>{remoteParticipantLabel}</strong>
                  <p style={mutedParagraphStyle}>
                    {callStatus === "connected"
                      ? "No remote camera is visible yet."
                      : "Connecting the first call experience..."}
                  </p>
                </div>
              )}
            </section>
            <aside style={selfViewPanelStyle}>
              <div style={tileHeaderStyle}>
                <h2 style={tileHeadingStyle}>You</h2>
                <span>{callSession.displayName}</span>
              </div>
              {localVideoTrack && isCameraEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={localVideoStyle}
                />
              ) : (
                <div style={selfPlaceholderStyle}>
                  <strong>{callSession.displayName}</strong>
                  <p style={mutedParagraphStyle}>
                    {isCameraEnabled ? "Camera is preparing..." : "Camera is off."}
                  </p>
                </div>
              )}
              <dl style={callFactsStyle}>
                <div>
                  <dt>Transport</dt>
                  <dd><code>{callSession.transportPreference}</code></dd>
                </div>
                <div>
                  <dt>Participants</dt>
                  <dd>{callParticipants}</dd>
                </div>
                <div>
                  <dt>Mic</dt>
                  <dd>{isMicEnabled ? "On" : "Off"}</dd>
                </div>
                <div>
                  <dt>Camera</dt>
                  <dd>{isCameraEnabled ? "On" : "Off"}</dd>
                </div>
              </dl>
              {connectedSfuUrl ? (
                <p style={metaTextStyle}>
                  SFU <code>{connectedSfuUrl}</code>
                </p>
              ) : null}
            </aside>
            <section style={controlsPanelStyle}>
              <button
                type="button"
                onClick={() => void handleToggleMicrophone()}
                disabled={callStatus !== "connected" || isTogglingMic}
                style={secondaryControlStyle}
              >
                {isTogglingMic ? "Updating Mic..." : isMicEnabled ? "Mute" : "Unmute"}
              </button>
              <button
                type="button"
                onClick={() => void handleToggleCamera()}
                disabled={callStatus !== "connected" || isTogglingCamera}
                style={secondaryControlStyle}
              >
                {isTogglingCamera ? "Updating Camera..." : isCameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
              </button>
              <button type="button" onClick={handleLeaveCall} style={dangerControlStyle}>
                Leave Call
              </button>
            </section>
            {callError ? <p role="alert">{callError}</p> : null}
          </section>
        ) : (
          <>
            {callError ? <p role="alert">{callError}</p> : null}
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, "", `/r/${viewState.slug}`);
                setViewState(getViewState(window.location.pathname));
              }}
            >
              Back To Join Screen
            </button>
          </>
        )}
      </main>
    );
  }

  if (viewState.kind === "waiting") {
    return (
      <main style={callPageStyle}>
        <section style={previewCardStyle}>
          <h1>Waiting For Host Approval</h1>
          <p style={mutedParagraphStyle}>
            Room <code>{viewState.slug}</code> is using lobby mode. We&apos;ll move you into the call as soon as the host approves your request.
          </p>
          {waitingRequest ? (
            <dl style={callFactsStyle}>
              <div>
                <dt>Name</dt>
                <dd>{waitingRequest.displayName}</dd>
              </div>
              <div>
                <dt>Preset</dt>
                <dd>{getQualityPresetLabel(waitingRequest.qualityPreset)}</dd>
              </div>
              <div>
                <dt>Mic</dt>
                <dd>{waitingRequest.requestedMedia.audio ? "On" : "Off"}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{waitingRequest.requestedMedia.video ? "On" : "Off"}</dd>
              </div>
            </dl>
          ) : null}
          {waitingStatus?.status === "waiting" || waitingStatus == null ? (
            <p>Approval is still pending.</p>
          ) : null}
          {waitingStatus?.status === "denied" ? (
            <p role="alert">
              Host denied this request: <strong>{waitingStatus.reason}</strong>
            </p>
          ) : null}
          {waitingError ? <p role="alert">{waitingError}</p> : null}
          <button
            type="button"
            onClick={() => {
              clearStoredLobbyRequest(window.sessionStorage, viewState.slug);
              window.history.pushState({}, "", `/r/${viewState.slug}`);
              setViewState(getViewState(window.location.pathname));
            }}
          >
            Back To Join Screen
          </button>
        </section>
      </main>
    );
  }

  if (viewState.kind === "room") {
    return (
      <main>
        <h1>LowTime</h1>
        <p>Open the room with only a display name, then move straight into the first SFU-backed call path.</p>
        <p>
          <strong>Room slug:</strong> {viewState.slug}
        </p>
        {isLoadingRoom ? <p>Loading room details...</p> : null}
        {roomError ? <p role="alert">{roomError}</p> : null}
        {roomSummary ? (
          <>
            <section>
              <h2>Room Preview</h2>
              <p>
                Access mode: <strong>{roomSummary.accessMode}</strong>
              </p>
              <p>
                Max participants: <strong>{roomSummary.maxParticipants}</strong>
              </p>
              <p>
                Quality cap: <strong>{roomSummary.qualityCap}</strong>
              </p>
              <p>
                Expires at: <strong>{new Date(roomSummary.expiresAt).toLocaleString()}</strong>
              </p>
            </section>
            <section>
              <h2>Join Room</h2>
              <div style={joinPreviewGridStyle}>
                <section style={previewCardStyle}>
                  <div style={tileHeaderStyle}>
                    <h3 style={tileHeadingStyle}>Device Preview</h3>
                    <span>{getQualityPresetLabel(selectedQualityPreset)}</span>
                  </div>
                  {previewState === "ready" && previewVideoEnabled ? (
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={previewVideoStyle}
                    />
                  ) : (
                    <div style={previewPlaceholderStyle}>
                      <strong>{previewVideoEnabled ? "Preview ready when you are" : "Audio-only join selected"}</strong>
                      <p style={mutedParagraphStyle}>{getPreviewStateMessage(previewState, previewError)}</p>
                    </div>
                  )}
                  <div style={previewOptionsStyle}>
                    <label style={toggleOptionStyle}>
                      <input
                        type="checkbox"
                        checked={previewAudioEnabled}
                        onChange={(event) => setPreviewAudioEnabled(event.target.checked)}
                      />
                      Start with microphone
                    </label>
                    <label style={toggleOptionStyle}>
                      <input
                        type="checkbox"
                        checked={previewVideoEnabled}
                        onChange={(event) => setPreviewVideoEnabled(event.target.checked)}
                      />
                      Start with camera
                    </label>
                    <label style={toggleOptionStyle}>
                      Quality preset
                      <select
                        value={selectedQualityPreset}
                        onChange={(event) => setSelectedQualityPreset(event.target.value as QualityPreset)}
                      >
                        <option value="data_saver">Data Saver</option>
                        <option value="balanced">Balanced</option>
                        <option value="best_quality">Best Quality</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={() => void handleStartPreview()} disabled={previewState === "requesting"}>
                    {previewState === "requesting" ? "Starting Preview..." : "Start Device Preview"}
                  </button>
                </section>
              </div>
              <label>
                Display name
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Enter your name"
                />
              </label>
              <div>
                <button type="button" onClick={() => void handleJoinRoom()} disabled={isJoining}>
                  {isJoining ? "Joining..." : "Join Room"}
                </button>
              </div>
              {joinError ? <p role="alert">{joinError}</p> : null}
              {joinResult?.joinState === "waiting" ? (
                <p>
                  Waiting for host approval. Request <code>{joinResult.requestId}</code> is queued.
                </p>
              ) : null}
              {joinResult?.joinState === "denied" ? (
                <p>
                  Join denied: <strong>{joinResult.reason}</strong>
                </p>
              ) : null}
            </section>
            {roomSummary.accessMode === "lobby" && hostSecret ? (
              <section style={previewCardStyle}>
                <div style={tileHeaderStyle}>
                  <h2 style={tileHeadingStyle}>Host Lobby Queue</h2>
                  <span>{hostLobbyRequests.length} pending</span>
                </div>
                {hostLobbyRequests.length === 0 ? (
                  <p style={mutedParagraphStyle}>No one is waiting right now.</p>
                ) : (
                  <div style={hostQueueStyle}>
                    {hostLobbyRequests.map((request) => (
                      <article key={request.requestId} style={hostQueueItemStyle}>
                        <div>
                          <strong>{request.displayName}</strong>
                          <p style={mutedParagraphStyle}>
                            Requested at {new Date(request.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <div style={controlsPanelStyle}>
                          <button type="button" onClick={() => void handleHostLobbyAction(request.requestId, "approve")}>
                            Approve
                          </button>
                          <button type="button" onClick={() => void handleHostLobbyAction(request.requestId, "deny")}>
                            Deny
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {hostLobbyError ? <p role="alert">{hostLobbyError}</p> : null}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    );
  }

  return (
    <main>
      <h1>LowTime</h1>
      <p>Create a room fast, share the link, and move directly into the SFU-backed join flow.</p>
      {isStandaloneApp || deferredInstallPrompt || installMessage ? (
        <section style={installCardStyle}>
          <h2 style={installHeadingStyle}>App Access</h2>
          <p style={mutedParagraphStyle}>
            {isStandaloneApp
              ? "LowTime is already installed on this device."
              : installMessage ?? "Add LowTime to your home screen for faster repeat joins."}
          </p>
          {!isStandaloneApp && deferredInstallPrompt ? (
            <button type="button" onClick={() => void handleInstallApp()} disabled={isInstallingApp}>
              {isInstallingApp ? "Opening Install Prompt..." : "Install LowTime"}
            </button>
          ) : null}
        </section>
      ) : null}
      <button type="button" onClick={() => void handleCreateRoom()} disabled={isCreating}>
        {isCreating ? "Creating..." : "Start Call"}
      </button>
      {createError ? <p role="alert">{createError}</p> : null}
      {createResult ? (
        <section>
          <h2>Room Ready</h2>
          <p>
            <strong>Share link:</strong>{" "}
            <a href={createResult.joinUrl}>{toAbsoluteJoinUrl(createResult.joinUrl)}</a>
          </p>
          <p>
            <strong>Host secret:</strong> {createResult.hostSecret}
          </p>
          <p>Store the host secret locally. It is not included in the room link.</p>
          <button type="button" onClick={() => void handleCopyLink()}>
            Copy Link
          </button>{" "}
          <button type="button" onClick={handleOpenRoom}>
            Open Link
          </button>
        </section>
      ) : null}
    </main>
  );
}

function toAbsoluteJoinUrl(joinUrl: string): string {
  return new URL(joinUrl, window.location.origin).toString();
}

const callPageStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1rem",
  maxWidth: "72rem",
  margin: "0 auto",
} as const;

const installCardStyle = {
  display: "grid",
  gap: "0.75rem",
  background: "#e0f2fe",
  border: "1px solid #7dd3fc",
  borderRadius: "1rem",
  padding: "1rem",
  marginBottom: "1rem",
  maxWidth: "32rem",
} as const;

const installHeadingStyle = {
  margin: 0,
} as const;

const callHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
} as const;

const callHeaderBadgeRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
} as const;

const callLayoutStyle = {
  display: "grid",
  gap: "1rem",
} as const;

const joinPreviewGridStyle = {
  display: "grid",
  gap: "1rem",
  marginBottom: "1rem",
} as const;

const previewCardStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1rem",
  borderRadius: "1rem",
  background: "#e2e8f0",
} as const;

const previewPlaceholderStyle = {
  minHeight: "14rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  background: "#cbd5e1",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

const previewVideoStyle = {
  width: "100%",
  maxWidth: "24rem",
  aspectRatio: "16 / 10",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#0f172a",
} as const;

const previewOptionsStyle = {
  display: "grid",
  gap: "0.75rem",
} as const;

const hostQueueStyle = {
  display: "grid",
  gap: "0.75rem",
} as const;

const hostQueueItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "0.75rem 1rem",
  borderRadius: "0.75rem",
  background: "#f8fafc",
} as const;

const toggleOptionStyle = {
  display: "grid",
  gap: "0.35rem",
} as const;

const remoteTileStyle = {
  minHeight: "20rem",
  background: "#0f172a",
  color: "#f8fafc",
  borderRadius: "1rem",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
} as const;

const selfViewPanelStyle = {
  background: "#e2e8f0",
  borderRadius: "1rem",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
} as const;

const controlsPanelStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
} as const;

const tileHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
} as const;

const tileHeadingStyle = {
  margin: 0,
} as const;

const tilePlaceholderStyle = {
  minHeight: "16rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  border: "1px dashed rgba(255, 255, 255, 0.35)",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

const selfPlaceholderStyle = {
  minHeight: "12rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  background: "#cbd5e1",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

const remoteVideoStyle = {
  width: "100%",
  minHeight: "16rem",
  maxHeight: "32rem",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#020617",
} as const;

const localVideoStyle = {
  width: "100%",
  maxWidth: "20rem",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#0f172a",
} as const;

const callFactsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
  gap: "0.75rem",
  margin: 0,
} as const;

const secondaryControlStyle = {
  borderRadius: "999px",
  padding: "0.75rem 1rem",
  border: "1px solid #94a3b8",
  background: "#f8fafc",
  color: "#0f172a",
} as const;

const dangerControlStyle = {
  borderRadius: "999px",
  padding: "0.75rem 1rem",
  border: "1px solid #ef4444",
  background: "#ef4444",
  color: "#fff",
} as const;

const mutedParagraphStyle = {
  color: "#64748b",
  margin: 0,
} as const;

const metaTextStyle = {
  color: "#334155",
  margin: 0,
} as const;

function callStatusBadgeStyle(callStatus: "idle" | "requesting_token" | "connecting" | "connected") {
  return {
    borderRadius: "999px",
    padding: "0.5rem 0.75rem",
    background:
      callStatus === "connected"
        ? "#dcfce7"
        : callStatus === "idle"
          ? "#e2e8f0"
          : "#fef3c7",
    color:
      callStatus === "connected"
        ? "#166534"
        : callStatus === "idle"
          ? "#334155"
          : "#92400e",
    fontWeight: 600,
    textTransform: "capitalize" as const,
  };
}

function networkBadgeStyle(networkHealth: NetworkHealth) {
  return {
    borderRadius: "999px",
    padding: "0.5rem 0.75rem",
    background:
      networkHealth === "good"
        ? "#dcfce7"
        : networkHealth === "fair"
          ? "#fef3c7"
          : networkHealth === "poor"
            ? "#fee2e2"
            : networkHealth === "offline"
              ? "#e2e8f0"
              : "#dbeafe",
    color:
      networkHealth === "good"
        ? "#166534"
        : networkHealth === "fair"
          ? "#92400e"
          : networkHealth === "poor"
            ? "#b91c1c"
            : networkHealth === "offline"
              ? "#334155"
              : "#1d4ed8",
    fontWeight: 600,
  };
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
