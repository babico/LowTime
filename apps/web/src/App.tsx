import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
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
  buildRequestedMedia,
  clearStoredCallSession,
  getApiBaseUrl,
  getCallRoute,
  getViewState,
  loadStoredCallSession,
  saveStoredCallSession,
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
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);

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

  const apiBaseUrl = useMemo(
    () => getApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location),
    [],
  );

  const callRoomRef = useRef<Awaited<ReturnType<typeof connectToSfu>> | null>(null);
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
    if (viewState.kind === "room") {
      return;
    }

    setRoomSummary(null);
    setRoomError(null);
    setJoinError(null);
    setJoinResult(null);
    setDisplayName("");
    setIsLoadingRoom(false);
  }, [viewState]);

  useEffect(() => {
    if (viewState.kind !== "room") {
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
      const response = await fetch(`${apiBaseUrl}/api/rooms/${viewState.slug}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          qualityPreset: DEFAULT_QUALITY_PRESET,
          requestedMedia: DEFAULT_REQUESTED_MEDIA,
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
          qualityPreset: DEFAULT_QUALITY_PRESET,
          transportPreference: payload.transportPreference,
          requestedMedia: buildRequestedMedia(DEFAULT_REQUESTED_MEDIA.audio, DEFAULT_REQUESTED_MEDIA.video),
        });

        window.history.pushState({}, "", getCallRoute(viewState.slug));
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
          </>
        ) : null}
      </main>
    );
  }

  return (
    <main>
      <h1>LowTime</h1>
      <p>Create a room fast, share the link, and move directly into the SFU-backed join flow.</p>
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
