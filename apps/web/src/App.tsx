import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
  QualityPreset,
  RoomSummary,
} from "@lowtime/shared";

import {
  buildRequestedMedia,
  getApiBaseUrl,
  getViewState,
  QUALITY_PRESET_OPTIONS,
} from "./room-entry.js";

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";

export function App() {
  const [viewState, setViewState] = useState(() => getViewState(window.location.pathname));
  const [createResult, setCreateResult] = useState<CreateRoomResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [roomSummary, setRoomSummary] = useState<RoomSummary | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>(DEFAULT_QUALITY_PRESET);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "ready">("idle");

  const apiBaseUrl = useMemo(
    () => getApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location),
    [],
  );

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

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
    if (previewVideoRef.current != null) {
      previewVideoRef.current.srcObject = previewStreamRef.current;
    }
  }, [previewState]);

  useEffect(() => {
    return () => {
      stopPreviewStream(previewStreamRef.current);
    };
  }, []);

  useEffect(() => {
    if (viewState.kind !== "room") {
      stopPreviewStream(previewStreamRef.current);
      previewStreamRef.current = null;
      setRoomSummary(null);
      setRoomError(null);
      setJoinError(null);
      setJoinResult(null);
      setDisplayName("");
      setPreviewState("idle");
      setPreviewError(null);
      setIsLoadingRoom(false);
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

  async function handlePreparePreview() {
    if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia == null) {
      setPreviewError("This browser does not expose media preview in the current environment.");
      setPreviewState("idle");
      return;
    }

    if (!audioEnabled && !videoEnabled) {
      setPreviewError("Enable audio or video before requesting device preview.");
      setPreviewState("idle");
      return;
    }

    setIsPreparingPreview(true);
    setPreviewError(null);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: audioEnabled,
        video: videoEnabled,
      });

      stopPreviewStream(previewStreamRef.current);
      previewStreamRef.current = nextStream;
      setPreviewState("ready");
    } catch (error) {
      stopPreviewStream(previewStreamRef.current);
      previewStreamRef.current = null;
      setPreviewState("idle");
      setPreviewError(error instanceof Error ? error.message : "Unable to prepare device preview");
    } finally {
      setIsPreparingPreview(false);
    }
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
          qualityPreset,
          requestedMedia: buildRequestedMedia(audioEnabled, videoEnabled),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Unable to join room");
      }

      const payload = (await response.json()) as JoinRoomResponse;
      setJoinResult(payload);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Unable to join room");
    } finally {
      setIsJoining(false);
    }
  }

  if (viewState.kind === "room") {
    return (
      <main>
        <h1>LowTime</h1>
        <p>Open the room with a display name, pick a quality preset, and preview devices before joining.</p>
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
              <label>
                Quality preset
                <select
                  value={qualityPreset}
                  onChange={(event) => setQualityPreset(event.target.value as QualityPreset)}
                >
                  {QUALITY_PRESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {
                  QUALITY_PRESET_OPTIONS.find((option) => option.value === qualityPreset)?.description
                }
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(event) => setAudioEnabled(event.target.checked)}
                />{" "}
                Join with audio
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={videoEnabled}
                  onChange={(event) => setVideoEnabled(event.target.checked)}
                />{" "}
                Join with video
              </label>
              <div>
                <button type="button" onClick={() => void handlePreparePreview()} disabled={isPreparingPreview}>
                  {isPreparingPreview ? "Preparing Preview..." : "Preview Devices"}
                </button>{" "}
                <button type="button" onClick={() => void handleJoinRoom()} disabled={isJoining}>
                  {isJoining ? "Joining..." : "Join Room"}
                </button>
              </div>
              {previewError ? <p role="alert">{previewError}</p> : null}
              {previewState === "ready" ? (
                <div>
                  <p>Device preview ready.</p>
                  {videoEnabled ? (
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", maxWidth: "24rem", background: "#111" }}
                    />
                  ) : (
                    <p>Microphone preview is ready. Video is currently off.</p>
                  )}
                </div>
              ) : (
                <p>Preview is optional but recommended before joining.</p>
              )}
              {joinError ? <p role="alert">{joinError}</p> : null}
              {joinResult?.joinState === "direct" ? (
                <p>
                  Joined directly as <strong>{displayName.trim()}</strong>. Session{" "}
                  <code>{joinResult.sessionId}</code> is ready for transport <code>{joinResult.transportPreference}</code>.
                </p>
              ) : null}
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
      <p>Create a room fast, share the link, and keep the call ready for the join flow that comes next.</p>
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

function stopPreviewStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}
