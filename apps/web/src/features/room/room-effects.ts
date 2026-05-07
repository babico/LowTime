import { useEffect, useState } from "react";

import type { LobbyRequestSummary, RoomSummary } from "@lowtime/shared";

export function useRoomPageData(input: {
  apiBaseUrl: string;
  hostSecret: string | null;
  slug: string | null;
}) {
  const [hostLobbyError, setHostLobbyError] = useState<string | null>(null);
  const [hostLobbyRequests, setHostLobbyRequests] = useState<LobbyRequestSummary[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomSummary, setRoomSummary] = useState<RoomSummary | null>(null);

  useEffect(() => {
    if (input.slug == null) {
      setRoomSummary(null);
      setRoomError(null);
      setIsLoadingRoom(false);
      return;
    }

    const abortController = new AbortController();

    async function loadRoom() {
      setIsLoadingRoom(true);
      setRoomError(null);

      try {
        const response = await fetch(`${input.apiBaseUrl}/api/rooms/${input.slug}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Unable to load room");
        }

        const payload = (await response.json()) as RoomSummary;
        setRoomSummary(payload);
      } catch (error) {
        if (!abortController.signal.aborted) {
          setRoomSummary(null);
          setRoomError(error instanceof Error ? error.message : "Unable to load room");
        }
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
  }, [input.apiBaseUrl, input.slug]);

  useEffect(() => {
    const { hostSecret, slug } = input;

    if (slug == null || roomSummary?.accessMode !== "lobby" || hostSecret == null) {
      setHostLobbyRequests([]);
      setHostLobbyError(null);
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    const loadLobbyRequests = async () => {
      try {
        const response = await fetch(`${input.apiBaseUrl}/api/rooms/${slug}/lobby`, {
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
  }, [input.apiBaseUrl, input.hostSecret, input.slug, roomSummary?.accessMode]);

  return {
    hostLobbyError,
    hostLobbyRequests,
    isLoadingRoom,
    roomError,
    roomSummary,
    setHostLobbyError,
    setHostLobbyRequests,
  };
}
