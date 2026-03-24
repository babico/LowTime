import { useEffect, useMemo, useState } from "react";

import type {
  CreateRoomResponse,
  JoinRoomResponse,
  QualityPreset,
  RequestedMedia,
  RoomSummary,
} from "@lowtime/shared";

type ViewState =
  | { kind: "home" }
  | { kind: "room"; slug: string };

const DEFAULT_QUALITY_PRESET: QualityPreset = "balanced";
const DEFAULT_REQUESTED_MEDIA: RequestedMedia = {
  audio: true,
  video: true,
};

function getViewState(pathname: string): ViewState {
  const roomMatch = pathname.match(/^\/r\/([A-Za-z0-9]+)$/);

  if (roomMatch == null) {
    return { kind: "home" };
  }

  return {
    kind: "room",
    slug: roomMatch[1],
  };
}

function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (configuredBaseUrl != null && configuredBaseUrl.trim() !== "") {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:3000`;
}

function toAbsoluteJoinUrl(joinUrl: string): string {
  return new URL(joinUrl, window.location.origin).toString();
}

export function App() {
  const [viewState, setViewState] = useState<ViewState>(() => getViewState(window.location.pathname));
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

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

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
    if (viewState.kind !== "room") {
      setRoomSummary(null);
      setRoomError(null);
      setJoinError(null);
      setJoinResult(null);
      setDisplayName("");
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
        <p>Open the room with only a display name. Media setup and token issuance come next.</p>
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
