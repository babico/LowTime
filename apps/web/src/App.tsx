import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
  LobbyRequestStatusResponse,
  QualityPreset,
} from "@lowtime/shared";

import { AppShell } from "./app/app-shell.js";
import {
  getCallPageRoute,
  getRoomRoute,
  getWaitingPageRoute,
  pushRoute,
  readViewState,
  toAbsoluteJoinUrl,
} from "./app/routes.js";
import { useCallFlow } from "./features/call/call-effects.js";
import { useInstallPrompt } from "./features/home/install-effects.js";
import { joinRoomRequest, submitLobbyAction } from "./features/room/room-actions.js";
import { useDevicePreview } from "./features/room/preview-effects.js";
import { useRoomPageData } from "./features/room/room-effects.js";
import { useWaitingRoomState } from "./features/waiting/waiting-effects.js";
import { assessNetworkHealth, type NetworkHealth } from "./network-health.js";
import {
  clearStoredLobbyRequest,
  getApiBaseUrl,
  loadStoredHostSecret,
  saveStoredHostSecret,
  saveStoredLobbyRequest,
  saveStoredCallSession,
  type StoredLobbyRequest,
} from "./room-entry.js";

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";
export function App() {
  const [viewState, setViewState] = useState(() => readViewState(window.location));
  const [createResult, setCreateResult] = useState<CreateRoomResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [selectedQualityPreset, setSelectedQualityPreset] = useState<QualityPreset>(DEFAULT_QUALITY_PRESET);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>(() =>
    assessNetworkHealth({
      callStatus: "idle",
      isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    }),
  );
  const hostSecret = useMemo(
    () => (viewState.kind === "home" ? null : loadStoredHostSecret(window.localStorage, viewState.slug)),
    [viewState],
  );
  const roomSlug = viewState.kind === "room" ? viewState.slug : null;
  const waitingSlug = viewState.kind === "waiting" ? viewState.slug : null;
  const waitingRequestId = viewState.kind === "waiting" ? viewState.requestId : null;

  const apiBaseUrl = useMemo(
    () => getApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location),
    [],
  );
  const {
    hostLobbyError,
    hostLobbyRequests,
    isLoadingRoom,
    roomError,
    roomSummary,
    setHostLobbyError,
    setHostLobbyRequests,
  } = useRoomPageData({
    apiBaseUrl,
    hostSecret,
    slug: roomSlug,
  });
  const waitingApprovalHandler = useCallback((
    request: StoredLobbyRequest,
    status: Extract<LobbyRequestStatusResponse, { status: "approved" }>,
  ) => {
    if (waitingSlug == null) {
      return;
    }

    saveStoredCallSession(window.sessionStorage, waitingSlug, {
      sessionId: status.sessionId,
      displayName: request.displayName,
      qualityPreset: request.qualityPreset,
      transportPreference: status.transportPreference,
      requestedMedia: request.requestedMedia,
    });

    pushRoute(window.history, window.location, getCallPageRoute(waitingSlug), setViewState);
  }, [waitingSlug]);
  const {
    waitingError,
    waitingRequest,
    waitingStatus,
  } = useWaitingRoomState({
    apiBaseUrl,
    onApproved: waitingApprovalHandler,
    requestId: waitingRequestId,
    slug: waitingSlug,
  });
  const {
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
  } = useCallFlow({
    apiBaseUrl,
    setViewState,
    viewState,
  });
  const {
    handleInstallApp,
    installMessage,
    isInstallingApp,
    isStandaloneApp,
    showInstallPrompt,
  } = useInstallPrompt();
  const {
    clearPreview,
    handleStartPreview,
    previewAudioEnabled,
    previewError,
    previewState,
    previewVideoEnabled,
    previewVideoRef,
    requestedMedia: previewRequestedMedia,
    setPreviewAudioEnabled,
    setPreviewVideoEnabled,
  } = useDevicePreview({
    viewState,
  });

  useEffect(() => {
    const handlePopState = () => {
      setViewState(readViewState(window.location));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
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

    setJoinError(null);
    setJoinResult(null);
    setDisplayName("");
    setSelectedQualityPreset(DEFAULT_QUALITY_PRESET);
  }, [viewState]);

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

    await navigator.clipboard.writeText(toAbsoluteJoinUrl(createResult.joinUrl, window.location));
  }

  function handleOpenRoom() {
    if (createResult == null) {
      return;
    }

    pushRoute(window.history, window.location, createResult.joinUrl, setViewState);
  }

  async function handleJoinRoom() {
    if (viewState.kind !== "room") {
      return;
    }

    setIsJoining(true);
      setJoinError(null);
      setJoinResult(null);

    try {
      const payload = await joinRoomRequest({
        apiBaseUrl,
        displayName,
        qualityPreset: selectedQualityPreset,
        requestedMedia: previewRequestedMedia,
        slug: viewState.slug,
      });
      setJoinResult(payload);

      if (payload.joinState === "direct") {
        saveStoredCallSession(window.sessionStorage, viewState.slug, {
          sessionId: payload.sessionId,
          displayName: displayName.trim(),
          qualityPreset: selectedQualityPreset,
          transportPreference: payload.transportPreference,
          requestedMedia: previewRequestedMedia,
        });

        clearPreview();
        pushRoute(window.history, window.location, getCallPageRoute(viewState.slug), setViewState);
      } else if (payload.joinState === "waiting") {
        const storedRequest: StoredLobbyRequest = {
          requestId: payload.requestId,
          displayName: displayName.trim(),
          qualityPreset: selectedQualityPreset,
          requestedMedia: previewRequestedMedia,
        };

        saveStoredLobbyRequest(window.sessionStorage, viewState.slug, storedRequest);
        pushRoute(
          window.history,
          window.location,
          getWaitingPageRoute(viewState.slug, payload.requestId),
          setViewState,
        );
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Unable to join room");
    } finally {
      setIsJoining(false);
    }
  }

  async function handleHostLobbyAction(requestId: string, action: "approve" | "deny") {
    if (viewState.kind !== "room" || hostSecret == null) {
      return;
    }

    setHostLobbyError(null);

    try {
      await submitLobbyAction({
        action,
        apiBaseUrl,
        hostSecret,
        requestId,
        slug: viewState.slug,
      });

      setHostLobbyRequests((current) => current.filter((entry) => entry.requestId !== requestId));
    } catch (error) {
      setHostLobbyError(error instanceof Error ? error.message : `Unable to ${action} lobby request`);
    }
  }

  return (
    <AppShell
      callPageProps={{
        callError,
        callParticipants,
        callSession,
        callStatus,
        connectedSfuUrl,
        hasLocalVideo: localVideoTrack != null,
        hasRemoteVideo: remoteVideoTrack != null,
        isCameraEnabled,
        isMicEnabled,
        isTogglingCamera,
        isTogglingMic,
        localVideoRef,
        networkHealth,
        onLeaveCall: handleLeaveCall,
        onToggleCamera: handleToggleCamera,
        onToggleMicrophone: handleToggleMicrophone,
        remoteParticipantLabel,
        remoteVideoRef,
        slug: viewState.kind === "call" ? viewState.slug : "",
      }}
      homePageProps={{
        createError,
        createResult,
        isCreating,
        isInstallingApp,
        isStandaloneApp,
        installMessage,
        onCopyLink: handleCopyLink,
        onCreateRoom: handleCreateRoom,
        onInstallApp: handleInstallApp,
        onOpenRoom: handleOpenRoom,
        shareUrl: createResult ? toAbsoluteJoinUrl(createResult.joinUrl, window.location) : null,
        showInstallPrompt,
      }}
      onBackToJoinFromCall={() => {
        if (viewState.kind !== "call") {
          return;
        }

        pushRoute(window.history, window.location, getRoomRoute(viewState.slug), setViewState);
      }}
      onBackToJoinFromWaiting={() => {
        if (viewState.kind !== "waiting") {
          return;
        }

        clearStoredLobbyRequest(window.sessionStorage, viewState.slug);
        pushRoute(window.history, window.location, getRoomRoute(viewState.slug), setViewState);
      }}
      roomPageProps={{
        displayName,
        hostLobbyError,
        hostLobbyRequests,
        hostSecret,
        isJoining,
        isLoadingRoom,
        joinError,
        joinResult,
        onDisplayNameChange: setDisplayName,
        onHostLobbyAction: handleHostLobbyAction,
        onJoinRoom: handleJoinRoom,
        onPreviewAudioChange: setPreviewAudioEnabled,
        onPreviewVideoChange: setPreviewVideoEnabled,
        onQualityPresetChange: setSelectedQualityPreset,
        onStartPreview: handleStartPreview,
        previewAudioEnabled,
        previewError,
        previewState,
        previewVideoEnabled,
        previewVideoRef,
        roomError,
        roomSummary,
        selectedQualityPreset,
        slug: viewState.kind === "room" ? viewState.slug : roomSlug ?? "",
      }}
      viewState={viewState}
      waitingPageProps={{
        slug: viewState.kind === "waiting" ? viewState.slug : waitingSlug ?? "",
        waitingError,
        waitingRequest,
        waitingStatus,
      }}
    />
  );
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
