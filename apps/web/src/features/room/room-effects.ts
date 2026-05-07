import { useCallback, useEffect, useRef, useState } from "react";

import type { LobbyRequestSummary, RoomSummary } from "@lowtime/shared";

import {
  clearStoredHostSecret,
  loadStoredHostSecret,
  saveStoredHostSecret,
} from "../../room-entry.js";
import { reclaimHostRole } from "./room-actions.js";

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

export type HostReclaimStatus =
  | "idle"
  | "checking"
  | "unlocked"
  | "needs-secret"
  | "unavailable";

export interface HostReclaimState {
  status: HostReclaimStatus;
  hostSecret: string | null;
  lobbyRequests: LobbyRequestSummary[];
  manualError: string | null;
  submitManualSecret: (value: string) => Promise<void>;
  clearManualError: () => void;
}

/**
 * Drives the host-reclaim flow for the room page.
 *
 * On mount, reads the cached host secret from storage. If present, calls
 * `/reclaim` once and transitions to `"unlocked"` on success, clearing the
 * cached secret silently on a 403 (stale credential) and keeping it on a 409
 * (unreclaimable room). When no secret is cached, transitions to
 * `"needs-secret"` once the caller-supplied `roomSummary` signals that the
 * slug resolves to a real room, enabling the Manual Reclaim Form.
 *
 * The hook owns the host-secret state for the room page; the only write to
 * `localStorage` happens on a successful reclaim response.
 */
export function useHostReclaim(input: {
  apiBaseUrl: string;
  slug: string | null;
  storage: Storage;
  hasRoomSummary: boolean;
}): HostReclaimState {
  const { apiBaseUrl, slug, storage, hasRoomSummary } = input;

  const [status, setStatus] = useState<HostReclaimStatus>("idle");
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [lobbyRequests, setLobbyRequests] = useState<LobbyRequestSummary[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);

  const hasFiredRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (slug == null) {
      setStatus("idle");
      setHostSecret(null);
      setLobbyRequests([]);
      setManualError(null);
      hasFiredRef.current = null;
      return;
    }

    // Only fire the automatic reclaim call once per (slug) mount.
    if (hasFiredRef.current === slug) {
      return;
    }

    const storedSecret = loadStoredHostSecret(storage, slug);

    if (storedSecret == null) {
      // No cached secret. Wait for the room summary to confirm the slug
      // actually resolves to a room before offering the manual form.
      if (hasRoomSummary) {
        hasFiredRef.current = slug;
        setStatus("needs-secret");
        setHostSecret(null);
        setLobbyRequests([]);
      }
      return;
    }

    hasFiredRef.current = slug;
    setStatus("checking");
    setHostSecret(storedSecret);
    setManualError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      const outcome = await reclaimHostRole({
        apiBaseUrl,
        hostSecret: storedSecret,
        slug,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      if (outcome.kind === "ok") {
        setStatus("unlocked");
        setLobbyRequests(outcome.response.lobbyRequests);
        return;
      }

      if (outcome.kind === "unauthorized") {
        clearStoredHostSecret(storage, slug);
        setHostSecret(null);
        setStatus("needs-secret");
        return;
      }

      if (outcome.kind === "unavailable") {
        setStatus("unavailable");
        return;
      }

      // Network or unexpected error: keep the stored secret (so a retry can
      // still succeed) and surface the message on the manual form.
      setStatus("needs-secret");
      setManualError(outcome.message);
    })();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, slug, storage, hasRoomSummary]);

  const submitManualSecret = useCallback(
    async (value: string) => {
      if (slug == null) {
        return;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return;
      }

      setManualError(null);
      setStatus("checking");

      const outcome = await reclaimHostRole({
        apiBaseUrl,
        hostSecret: trimmed,
        slug,
      });

      if (outcome.kind === "ok") {
        saveStoredHostSecret(storage, slug, trimmed);
        setHostSecret(trimmed);
        setLobbyRequests(outcome.response.lobbyRequests);
        setStatus("unlocked");
        return;
      }

      if (outcome.kind === "unauthorized") {
        setStatus("needs-secret");
        setManualError("That host secret is not valid for this room.");
        return;
      }

      if (outcome.kind === "unavailable") {
        setStatus("unavailable");
        setManualError("This room is no longer available.");
        return;
      }

      setStatus("needs-secret");
      setManualError(outcome.message);
    },
    [apiBaseUrl, slug, storage],
  );

  const clearManualError = useCallback(() => {
    setManualError(null);
  }, []);

  return {
    status,
    hostSecret,
    lobbyRequests,
    manualError,
    submitManualSecret,
    clearManualError,
  };
}
