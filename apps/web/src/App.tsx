import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
  LobbyRequestStatusResponse,
  QualityPreset,
} from "@lowtime/shared";

import { CallPage } from "./features/call/call-page.js";
import { useCallFlow } from "./features/call/call-effects.js";
import { useInstallPrompt } from "./features/home/install-effects.js";
import { HomePage } from "./features/home/home-page.js";
import { joinRoomRequest, submitLobbyAction } from "./features/room/room-actions.js";
import { useDevicePreview } from "./features/room/preview-effects.js";
import { useRoomPageData } from "./features/room/room-effects.js";
import { RoomPage } from "./features/room/room-page.js";
import { useWaitingRoomState } from "./features/waiting/waiting-effects.js";
import { WaitingPage } from "./features/waiting/waiting-page.js";
import { assessNetworkHealth, type NetworkHealth } from "./network-health.js";
import {
  clearStoredLobbyRequest,
  getApiBaseUrl,
  getCallRoute,
  getViewState,
  getWaitingRoute,
  loadStoredHostSecret,
  saveStoredHostSecret,
  saveStoredLobbyRequest,
  saveStoredCallSession,
  type StoredLobbyRequest,
} from "./room-entry.js";

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";
export function App() {
  const [viewState, setViewState] = useState(() => getViewState(window.location.pathname));
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

    window.history.pushState({}, "", getCallRoute(waitingSlug));
    setViewState(getViewState(window.location.pathname));
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
      setViewState(getViewState(window.location.pathname));
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

    await navigator.clipboard.writeText(toAbsoluteJoinUrl(createResult.joinUrl));
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
        window.history.pushState({}, "", getCallRoute(viewState.slug));
        setViewState(getViewState(window.location.pathname));
      } else if (payload.joinState === "waiting") {
        const storedRequest: StoredLobbyRequest = {
          requestId: payload.requestId,
          displayName: displayName.trim(),
          qualityPreset: selectedQualityPreset,
          requestedMedia: previewRequestedMedia,
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
      showInstallPrompt={showInstallPrompt}
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
