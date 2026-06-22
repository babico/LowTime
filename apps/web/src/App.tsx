import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AccessMode,
  AdvancedMediaPrefs,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  LobbyRequestStatusResponse,
  QualityPreset,
  RoomSummary,
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
import { useAutoDowngrade } from "./auto-downgrade.js";
import { useAudioOnlyPrompt } from "./audio-only-prompt.js";
import { computeEffectivePublishOptions } from "./quality-presets.js";
import { joinRoomRequest, submitLobbyAction } from "./features/room/room-actions.js";
import { useDevicePreview } from "./features/room/preview-effects.js";
import { useRoomPageData, useHostReclaim } from "./features/room/room-effects.js";
import { useRoomSignaling, type P2PSignalEvent } from "./features/room/room-signaling.js";
import { useWaitingRoomState } from "./features/waiting/waiting-effects.js";
import { assessNetworkHealth, type NetworkHealth } from "./network-health.js";
import {
  clearStoredLobbyRequest,
  getApiBaseUrl,
  loadStoredCallSession,
  saveStoredHostSecret,
  saveStoredLobbyRequest,
  saveStoredCallSession,
  type StoredLobbyRequest,
} from "./room-entry.js";

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
export function App() {
  const [viewState, setViewState] = useState(() => readViewState(window.location));
  const [createResult, setCreateResult] = useState<CreateRoomResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAccessMode, setSelectedAccessMode] = useState<AccessMode>(DEFAULT_ACCESS_MODE);
  const [createPasscodeInput, setCreatePasscodeInput] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [selectedQualityPreset, setSelectedQualityPreset] = useState<QualityPreset>(DEFAULT_QUALITY_PRESET);
  const [advancedPrefs, setAdvancedPrefs] = useState<AdvancedMediaPrefs>({});
  const [joinPasscodeInput, setJoinPasscodeInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>(() =>
    assessNetworkHealth({
      callStatus: "idle",
      isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    }),
  );
  const roomSlug = viewState.kind === "room" ? viewState.slug : null;
  const waitingSlug = viewState.kind === "waiting" ? viewState.slug : null;
  const waitingRequestId = viewState.kind === "waiting" ? viewState.requestId : null;

  const apiBaseUrl = useMemo(
    () => getApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location),
    [],
  );
  const [cachedHasRoomSummary, setCachedHasRoomSummary] = useState(false);
  const hostReclaim = useHostReclaim({
    apiBaseUrl,
    slug: roomSlug,
    storage: window.localStorage,
    hasRoomSummary: cachedHasRoomSummary,
  });
  const effectiveHostSecret =
    hostReclaim.status === "unlocked" ? hostReclaim.hostSecret : null;
  const hostSecret = effectiveHostSecret;
  const isHost = hostSecret != null && hostSecret !== "";
  const reclaimRoomPageProps = {
    reclaimStatus: hostReclaim.status,
    reclaimManualError: hostReclaim.manualError,
    onSubmitReclaimSecret: hostReclaim.submitManualSecret,
  } as const;
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
    hostSecret: effectiveHostSecret,
    slug: roomSlug,
  });

  useEffect(() => {
    setCachedHasRoomSummary(roomSummary != null);
  }, [roomSummary]);

  // Seed the lobby queue with the reclaim response so the host sees pending
  // requests without waiting for the next polling tick.
  useEffect(() => {
    if (hostReclaim.status === "unlocked" && hostReclaim.lobbyRequests.length > 0) {
      setHostLobbyRequests(hostReclaim.lobbyRequests);
    }
  }, [hostReclaim.status, hostReclaim.lobbyRequests, setHostLobbyRequests]);
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

  // sendSignalMessage ref: populated after useRoomSignaling is called below.
  // Passed to useCallFlow so P2P fallback can send messages without a
  // circular hook dependency.
  const sendSignalMessageRef = useRef<(message: Record<string, unknown>) => void>(() => {});
  const removedFromRoomRef = useRef<boolean>(false);
  const handleP2PMessageRef = useRef<(event: P2PSignalEvent) => void>(() => {});

  // Read the stored call session directly so the signaling socket can
  // attach on the first render instead of waiting for the call-flow state
  // to land on a later render.
  const initialCallSessionId =
    viewState.kind === "call"
      ? loadStoredCallSession(window.sessionStorage, viewState.slug)?.sessionId ?? null
      : null;

  // Live room signaling: subscribe while we have a concrete sessionId so
  // `room.settings_updated` events propagate to the page in real time.
  const { latestRoomSummary, sendSignalMessage, chatMessages, removedFromRoom } = useRoomSignaling({
    apiBaseUrl,
    slug: viewState.kind === "call" ? viewState.slug : null,
    sessionId: initialCallSessionId,
    onP2PMessage: (event) => handleP2PMessageRef.current(event),
  });

  removedFromRoomRef.current = removedFromRoom;

  const {
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
    p2pError,
    p2pStatus,
    remoteParticipantLabel,
    remoteVideoRef,
    remoteVideoRefMap,
    remoteVideoTiles,
  } = useCallFlow({
    apiBaseUrl,
    setViewState,
    viewState,
    sendSignalMessage: (msg) => sendSignalMessageRef.current(msg),
    maxParticipants: roomSummary?.maxParticipants,
    hostSecret,
    isHost,
    removedFromRoomRef,
  });

  handleP2PMessageRef.current = handleP2PMessage;

  // Keep the ref in sync so useCallFlow's sendSignalMessage wrapper is always current.
  sendSignalMessageRef.current = sendSignalMessage;

  function handleSendChat(body: string) {
    sendSignalMessage({ kind: "chat.send", body });
  }

  // Prefer the live summary from the signaling hook when the room page is
  // visible; fall back to the REST-fetched summary otherwise. This keeps the
  // access mode / quality cap in sync with any host-driven settings change.
  const effectiveRoomSummary: RoomSummary | null = latestRoomSummary ?? roomSummary;

  const basePublishOptions = useMemo(() => {
    if (callSession == null) return null;
    return computeEffectivePublishOptions({
      preset: callSession.qualityPreset,
      cap: effectiveRoomSummary?.qualityCap ?? "high",
      advanced: callSession.advancedPrefs,
    });
  }, [callSession, effectiveRoomSummary?.qualityCap]);

  const { rung: downgradeRung, lastTransitionAt, restore: restoreQuality } = useAutoDowngrade({
    callStatus,
    networkHealth,
    room: callRoom,
    basePublishOptions,
  });

  const { promptState: audioOnlyPromptState, accept: acceptAudioOnlyPrompt, dismiss: dismissAudioOnlyPrompt } =
    useAudioOnlyPrompt({
      rung: downgradeRung,
      lastRungTransitionAt: lastTransitionAt,
    });

  // Accepting the audio-only suggestion locks the session into audio-only by
  // updating the stored session and bumping advanced prefs on the fly. The
  // auto-downgrade hook then keeps the ladder at its current rung because
  // `basePublishOptions.audioOnly` is now true.
  const handleAcceptAudioOnly = useCallback(() => {
    acceptAudioOnlyPrompt();
    if (viewState.kind === "call" && callSession != null) {
      const nextSession = {
        ...callSession,
        advancedPrefs: {
          ...(callSession.advancedPrefs ?? {}),
          audioOnly: true,
        },
      };
      saveStoredCallSession(window.sessionStorage, viewState.slug, nextSession);
    }
  }, [acceptAudioOnlyPrompt, callSession, viewState]);
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
    qualityPreset: selectedQualityPreset,
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
    setJoinPasscodeInput("");
    setAdvancedPrefs({});
  }, [viewState]);

  // When the user navigates away from the home page, drop the in-memory
  // plaintext passcode so it is not retained across route changes.
  useEffect(() => {
    if (viewState.kind !== "home") {
      setCreateResult(null);
      setCreatePasscodeInput("");
    }
  }, [viewState]);

  async function handleCreateRoom() {
    setIsCreating(true);
    setCreateError(null);

    try {
      const requestBody: CreateRoomRequest = {
        accessMode: selectedAccessMode,
      };
      if (selectedAccessMode === "passcode") {
        requestBody.passcode = createPasscodeInput;
      }

      const response = await fetch(`${apiBaseUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Unable to create room");
      }

      const payload = (await response.json()) as CreateRoomResponse;
      setCreateResult(payload);
      saveStoredHostSecret(window.localStorage, payload.roomSlug, payload.hostSecret);
      // Clear the plaintext input as soon as we have the server response.
      // The plaintext returned in `payload.passcode` lives only in
      // `createResult` state and is cleared on navigation below.
      setCreatePasscodeInput("");
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

  async function handleCopyPasscode() {
    if (createResult?.passcode == null) {
      return;
    }

    await navigator.clipboard.writeText(createResult.passcode);
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
        passcode: joinPasscodeInput.length > 0 ? joinPasscodeInput : undefined,
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
          advancedPrefs,
        });

        clearPreview();
        setJoinPasscodeInput("");
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
        audioOnlyPromptState,
        callError,
        callParticipants,
        callSession,
        callStatus,
        connectedSfuUrl,
        downgradeRung,
        hasLocalVideo: localVideoTrack != null,
        hasRemoteVideo: remoteVideoTiles.length > 0,
        isCameraEnabled,
        isHost,
        isMicEnabled,
        isRemovingParticipant,
        isTogglingCamera,
        isTogglingMic,
        localVideoRef,
        networkHealth,
        onAcceptAudioOnly: handleAcceptAudioOnly,
        onDismissAudioOnly: dismissAudioOnlyPrompt,
        onLeaveCall: handleLeaveCall,
        onRemoveParticipant: handleRemoveParticipant,
        onRestoreQuality: restoreQuality,
        onToggleCamera: handleToggleCamera,
        onToggleMicrophone: handleToggleMicrophone,
        participants: latestRoomSummary?.participants ?? [],
        p2pError,
        p2pStatus,
        chatMessages,
        onSendChat: handleSendChat,
        remoteParticipantLabel,
        remoteVideoRefMap,
        remoteVideoTiles: remoteVideoTiles.map((tile) => ({ id: tile.id, label: tile.label })),
        slug: viewState.kind === "call" ? viewState.slug : "",
      }}
      homePageProps={{
        createError,
        createResult,
        isCreating,
        isInstallingApp,
        isStandaloneApp,
        installMessage,
        onAccessModeChange: (mode) => {
          setSelectedAccessMode(mode);
          if (mode !== "passcode") {
            setCreatePasscodeInput("");
          }
        },
        onCopyLink: handleCopyLink,
        onCopyPasscode: handleCopyPasscode,
        onCreateRoom: handleCreateRoom,
        onInstallApp: handleInstallApp,
        onOpenRoom: handleOpenRoom,
        onPasscodeInputChange: setCreatePasscodeInput,
        passcodeError: null,
        passcodeInput: createPasscodeInput,
        selectedAccessMode,
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
        advancedPrefs,
        displayName,
        hostLobbyError,
        hostLobbyRequests,
        hostSecret: effectiveHostSecret,
        isJoining,
        isLoadingRoom,
        joinError,
        joinResult,
        onAdvancedPrefsChange: setAdvancedPrefs,
        onDisplayNameChange: setDisplayName,
        onHostLobbyAction: handleHostLobbyAction,
        onJoinRoom: handleJoinRoom,
        onPasscodeInputChange: setJoinPasscodeInput,
        onPreviewAudioChange: setPreviewAudioEnabled,
        onPreviewVideoChange: setPreviewVideoEnabled,
        onQualityPresetChange: setSelectedQualityPreset,
        onStartPreview: handleStartPreview,
        passcodeInput: joinPasscodeInput,
        previewAudioEnabled,
        previewError,
        previewState,
        previewVideoEnabled,
        previewVideoRef,
        roomError,
        roomSummary,
        selectedQualityPreset,
        slug: viewState.kind === "room" ? viewState.slug : roomSlug ?? "",
        ...reclaimRoomPageProps,
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
