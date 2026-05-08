import type { FastifyBaseLogger } from "fastify";

import { getRoomStatus } from "./room-status.js";
import type { RoomStore } from "./room-store.js";

/** Ten minutes. Lobby requests older than this are reaped by the tick. */
export const LOBBY_REQUEST_TTL_MS = 10 * 60 * 1000;

/** Five minutes. Closed rooms are kept in the store this long before reap. */
export const CLOSED_ROOM_GRACE_WINDOW_MS = 5 * 60 * 1000;

export interface CleanupOptions {
  lobbyRequestTtlMs?: number;
  closedRoomGraceWindowMs?: number;
  logger?: Pick<FastifyBaseLogger, "info" | "error">;
}

export interface CleanupResult {
  expiredRoomsRemoved: number;
  closedRoomsReaped: number;
  lobbyRequestsTimedOut: number;
}

/**
 * Sweeps the Room_Store once.
 *
 *   1. Captures `now` once and reuses it for every comparison in the tick.
 *   2. Iterates `store.listRoomSlugs()` (a fresh array) so in-tick deletions
 *      do not confuse the iterator.
 *   3. For each room, decides `idle-expired`, `closed-past-grace`, or `keep`.
 *   4. For kept rooms that are not closed, reaps waiting lobby requests older
 *      than `lobbyRequestTtlMs` and marks them denied with `"lobby_timeout"`.
 *
 * Emits one structured log record per state change at `info` level. A tick
 * that performs no mutations emits no `info` records; Requirement 9.5 allows
 * but does not require a `debug`-level heartbeat.
 *
 * The function is pure with respect to the clock (takes `now`) and the
 * logger (takes a `Pick<FastifyBaseLogger, "info" | "error">`). Tests inject
 * both deterministically.
 */
export function runCleanupTick(
  store: RoomStore,
  options: CleanupOptions,
  now: Date,
): CleanupResult {
  const tickNow = now.getTime();
  const lobbyTtl = options.lobbyRequestTtlMs ?? LOBBY_REQUEST_TTL_MS;
  const closedGrace = options.closedRoomGraceWindowMs ?? CLOSED_ROOM_GRACE_WINDOW_MS;
  const logger = options.logger;

  let expiredRoomsRemoved = 0;
  let closedRoomsReaped = 0;
  let lobbyRequestsTimedOut = 0;

  for (const slug of store.listRoomSlugs()) {
    const room = store.getRoom(slug);
    if (room == null) continue;

    const status = getRoomStatus(room, now);

    if (room.status !== "closed" && status === "expired") {
      store.deleteRoom(slug);
      expiredRoomsRemoved += 1;
      logger?.info(
        {
          event: "room_cleanup",
          action: "room_idle_expired",
          roomSlug: slug,
          lastActivityAt: room.lastActivityAt,
          expiresAt: room.expiresAt,
        },
        "room expired",
      );
      continue;
    }

    if (room.status === "closed") {
      if (room.closedAt != null && Date.parse(room.closedAt) + closedGrace <= tickNow) {
        store.deleteRoom(slug);
        closedRoomsReaped += 1;
        logger?.info(
          {
            event: "room_cleanup",
            action: "room_closed_reaped",
            roomSlug: slug,
            closedAt: room.closedAt,
          },
          "closed room reaped",
        );
      }
      continue;
    }

    // Still-live room: reap stale waiting lobby requests.
    for (const request of room.lobbyRequests) {
      if (request.status !== "waiting") continue;
      if (Date.parse(request.createdAt) + lobbyTtl > tickNow) continue;

      store.denyLobbyRequest(slug, request.id, "lobby_timeout");
      lobbyRequestsTimedOut += 1;
      logger?.info(
        {
          event: "room_cleanup",
          action: "lobby_request_timed_out",
          roomSlug: slug,
          requestId: request.id,
          createdAt: request.createdAt,
        },
        "lobby request timed out",
      );
    }
  }

  return { expiredRoomsRemoved, closedRoomsReaped, lobbyRequestsTimedOut };
}

export interface CleanupScheduler {
  schedule(callback: () => void, intervalMs: number): unknown;
  cancel(handle: unknown): void;
}

export function createIntervalScheduler(): CleanupScheduler {
  return {
    schedule(callback, intervalMs) {
      const handle = setInterval(callback, intervalMs);
      // Allow the Node event loop to exit while the interval is pending so
      // `buildApp` does not accidentally hold the process open.
      const maybeUnref = (handle as unknown as { unref?: () => void }).unref;
      if (typeof maybeUnref === "function") {
        maybeUnref.call(handle);
      }
      return handle;
    },
    cancel(handle) {
      clearInterval(handle as NodeJS.Timeout);
    },
  };
}

export interface StartCleanupLoopInput {
  store: RoomStore;
  intervalMs: number;
  now: () => Date;
  logger: Pick<FastifyBaseLogger, "info" | "error">;
  scheduler?: CleanupScheduler;
  cleanupOptions?: Omit<CleanupOptions, "logger">;
}

export interface CleanupLoopHandle {
  stop(): void;
}

/**
 * Starts the cleanup loop. Tick errors are caught and logged as
 * `{ event: "room_cleanup", action: "tick_failed" }`; subsequent ticks
 * continue to run.
 */
export function startCleanupLoop(input: StartCleanupLoopInput): CleanupLoopHandle {
  const scheduler = input.scheduler ?? createIntervalScheduler();

  const handle = scheduler.schedule(() => {
    try {
      runCleanupTick(
        input.store,
        { ...(input.cleanupOptions ?? {}), logger: input.logger },
        input.now(),
      );
    } catch (error) {
      input.logger.error(
        {
          event: "room_cleanup",
          action: "tick_failed",
          message: error instanceof Error ? error.message : String(error),
        },
        "cleanup tick failed",
      );
    }
  }, input.intervalMs);

  return {
    stop() {
      scheduler.cancel(handle);
    },
  };
}
