import { useEffect, useState } from "react";

import type { LobbyRequestStatusResponse } from "@lowtime/shared";

import { clearStoredLobbyRequest, loadStoredLobbyRequest, type StoredLobbyRequest } from "../../room-entry.js";

export function useWaitingRoomState(input: {
  apiBaseUrl: string;
  onApproved: (request: StoredLobbyRequest, status: Extract<LobbyRequestStatusResponse, { status: "approved" }>) => void;
  requestId: string | null;
  slug: string | null;
}) {
  const [waitingError, setWaitingError] = useState<string | null>(null);
  const [waitingRequest, setWaitingRequest] = useState<StoredLobbyRequest | null>(null);
  const [waitingStatus, setWaitingStatus] = useState<LobbyRequestStatusResponse | null>(null);

  useEffect(() => {
    const { requestId, slug } = input;

    if (slug == null || requestId == null) {
      setWaitingRequest(null);
      setWaitingStatus(null);
      setWaitingError(null);
      return;
    }

    const storedRequest = loadStoredLobbyRequest(window.sessionStorage, slug);

    if (storedRequest == null || storedRequest.requestId !== requestId) {
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
        const response = await fetch(`${input.apiBaseUrl}/api/rooms/${slug}/lobby/${requestId}`);

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
          clearStoredLobbyRequest(window.sessionStorage, slug);
          input.onApproved(storedRequest, payload);
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
  }, [input.apiBaseUrl, input.onApproved, input.requestId, input.slug]);

  return {
    waitingError,
    waitingRequest,
    waitingStatus,
  };
}
