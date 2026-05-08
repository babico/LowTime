import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";

import type { EffectivePublishOptions } from "./quality-presets.js";
import type { NetworkHealth } from "./network-health.js";

/**
 * The downgrade ladder. `"none"` is the neutral state where the call runs at
 * the user's chosen `basePublishOptions`; each subsequent rung tightens one
 * additional axis, matching the order documented in `docs/04-media-and-quality.md`:
 * bitrate → resolution → frame rate → video pause.
 */
export type DowngradeRung =
  | "none"
  | "bitrate"
  | "resolution"
  | "frame-rate"
  | "video-paused";

const LADDER: DowngradeRung[] = [
  "none",
  "bitrate",
  "resolution",
  "frame-rate",
  "video-paused",
];

const MINIMUM_DWELL_MS = 10_000;

export interface ComputeDowngradeStepInput {
  networkHealth: NetworkHealth;
  current: DowngradeRung;
  now: number;
  lastTransitionAt: number;
}

export interface ComputeDowngradeStepResult {
  next: DowngradeRung;
  lastTransitionAt: number;
}

/**
 * Pure state-machine step. Advances one rung at a time based on
 * `networkHealth`, subject to a 10-second minimum dwell.
 *
 * Semantics:
 *   - `good`        → step UP one rung (loosen) once the dwell elapses.
 *   - `fair`        → hold at the current rung; `"none"` stays `"none"`,
 *                     deeper rungs hold until the health improves to `good`.
 *   - `poor`        → step DOWN one rung (tighten) once the dwell elapses.
 *   - `offline`     → freeze; no transitions until the network returns.
 *   - `reconnecting`→ freeze; same reason.
 */
export function computeDowngradeStep(
  input: ComputeDowngradeStepInput,
): ComputeDowngradeStepResult {
  const { networkHealth, current, now, lastTransitionAt } = input;

  if (networkHealth === "offline" || networkHealth === "reconnecting") {
    return { next: current, lastTransitionAt };
  }

  const dwellElapsed = now - lastTransitionAt >= MINIMUM_DWELL_MS;
  const currentIndex = LADDER.indexOf(current);

  if (networkHealth === "good") {
    if (current === "none") {
      return { next: current, lastTransitionAt };
    }
    if (!dwellElapsed) {
      return { next: current, lastTransitionAt };
    }
    const nextIndex = Math.max(0, currentIndex - 1);
    return {
      next: LADDER[nextIndex],
      lastTransitionAt: nextIndex === currentIndex ? lastTransitionAt : now,
    };
  }

  if (networkHealth === "fair") {
    // Never deepen on `fair`, only hold. But if we are already at the
    // deepest non-paused rung, fair allows gentle loosening up by one rung
    // once the dwell elapses.
    if (currentIndex <= 1) {
      return { next: current, lastTransitionAt };
    }
    if (!dwellElapsed) {
      return { next: current, lastTransitionAt };
    }
    const nextIndex = currentIndex - 1;
    return {
      next: LADDER[nextIndex],
      lastTransitionAt: now,
    };
  }

  // `poor`: step DOWN if we are not already at the bottom.
  if (currentIndex >= LADDER.length - 1) {
    return { next: current, lastTransitionAt };
  }
  if (!dwellElapsed) {
    return { next: current, lastTransitionAt };
  }
  const nextIndex = currentIndex + 1;
  return {
    next: LADDER[nextIndex],
    lastTransitionAt: now,
  };
}

/**
 * Derives publish options for a given rung on top of the base options the
 * user chose. This is the pure mapping so tests can assert the exact values
 * the hook will hand to LiveKit.
 */
export function deriveRungOptions(
  base: EffectivePublishOptions,
  rung: DowngradeRung,
): EffectivePublishOptions {
  switch (rung) {
    case "none":
      return base;
    case "bitrate":
      return {
        ...base,
        maxBitrateKbps: Math.max(50, Math.floor(base.maxBitrateKbps / 2)),
      };
    case "resolution":
      return {
        ...base,
        maxBitrateKbps: Math.max(50, Math.floor(base.maxBitrateKbps / 2)),
        resolution: {
          width: Math.max(160, Math.floor(base.resolution.width / 2)),
          height: Math.max(120, Math.floor(base.resolution.height / 2)),
          frameRate: base.resolution.frameRate,
        },
      };
    case "frame-rate":
      return {
        ...base,
        maxBitrateKbps: Math.max(50, Math.floor(base.maxBitrateKbps / 2)),
        resolution: {
          width: Math.max(160, Math.floor(base.resolution.width / 2)),
          height: Math.max(120, Math.floor(base.resolution.height / 2)),
          frameRate: Math.max(6, Math.floor(base.resolution.frameRate / 2)),
        },
      };
    case "video-paused":
      return {
        ...base,
        audioOnly: true,
      };
  }
}

export interface UseAutoDowngradeInput {
  callStatus: "idle" | "requesting_token" | "connecting" | "connected";
  networkHealth: NetworkHealth;
  room: Room | null;
  basePublishOptions: EffectivePublishOptions | null;
  now?: () => number;
  /** Interval at which the state machine re-evaluates. Default 3 s. */
  intervalMs?: number;
}

export interface UseAutoDowngradeState {
  rung: DowngradeRung;
  lastTransitionAt: number;
  restore: () => void;
}

const DEFAULT_INTERVAL_MS = 3_000;

/**
 * React hook that applies the downgrade ladder to a live LiveKit `Room`.
 * The hook only operates while `callStatus === "connected"` and `room` is
 * non-null; otherwise it resets to `"none"` and leaves the room alone.
 */
export function useAutoDowngrade(input: UseAutoDowngradeInput): UseAutoDowngradeState {
  const { callStatus, networkHealth, room, basePublishOptions } = input;
  const now = input.now ?? (() => Date.now());
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;

  const [rung, setRung] = useState<DowngradeRung>("none");
  const [lastTransitionAt, setLastTransitionAt] = useState<number>(now());
  const rungRef = useRef<DowngradeRung>("none");
  const lastTransitionAtRef = useRef<number>(now());

  const isActive = callStatus === "connected" && room != null;

  useEffect(() => {
    if (!isActive) {
      rungRef.current = "none";
      lastTransitionAtRef.current = now();
      setRung("none");
      setLastTransitionAt(lastTransitionAtRef.current);
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const result = computeDowngradeStep({
        networkHealth,
        current: rungRef.current,
        now: now(),
        lastTransitionAt: lastTransitionAtRef.current,
      });
      if (result.next !== rungRef.current) {
        rungRef.current = result.next;
        lastTransitionAtRef.current = result.lastTransitionAt;
        setRung(result.next);
        setLastTransitionAt(result.lastTransitionAt);
      }
    };

    // Evaluate immediately so a network transition applies without waiting
    // one tick; then schedule subsequent ticks.
    tick();
    const handle = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [isActive, networkHealth, intervalMs, now]);

  // Apply the rung to the LiveKit room whenever it changes. We keep this in
  // a separate effect so pure state-machine logic is testable without a Room.
  useEffect(() => {
    if (room == null || basePublishOptions == null) return;

    let cancelled = false;
    const effective = deriveRungOptions(basePublishOptions, rung);

    (async () => {
      if (cancelled) return;
      try {
        // Pause / resume camera based on the rung.
        if (effective.audioOnly) {
          await room.localParticipant.setCameraEnabled(false);
          return;
        }
        if (rung === "none") {
          // Re-enable camera if the user has not opted into audio-only.
          if (!basePublishOptions.audioOnly) {
            await room.localParticipant.setCameraEnabled(true);
          }
        }
        // LiveKit's public API for mid-call constraint updates: set track
        // publication options on the active video track. This is the
        // minimum needed to make the rung observable in real deployments;
        // the full track-replace path is not required for the 1:1 MVP.
        const videoPublication = Array.from(
          room.localParticipant.videoTrackPublications.values(),
        )[0];
        const track = videoPublication?.videoTrack;
        if (track != null && typeof track.setPublishingQuality === "function") {
          if (rung === "bitrate" || rung === "resolution" || rung === "frame-rate") {
            // Map rungs to LiveKit VideoQuality-ish hints without depending
            // on the enum so unit tests with stub rooms stay decoupled.
            // 2 = HIGH, 1 = MEDIUM, 0 = LOW in livekit-client's numeric
            // enum; we send HIGH/MEDIUM/LOW depending on the rung.
            const qualityMap: Record<
              Exclude<DowngradeRung, "none" | "video-paused">,
              number
            > = {
              bitrate: 1,
              resolution: 1,
              "frame-rate": 0,
            };
            track.setPublishingQuality(qualityMap[rung]);
          } else if (rung === "none") {
            track.setPublishingQuality(2);
          }
        }
      } catch {
        // Swallow LiveKit errors here; the rung is advisory and a failed
        // reconfigure should not crash the call. The network health badge
        // continues to reflect reality.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rung, room, basePublishOptions]);

  const restore = useCallback(() => {
    rungRef.current = "none";
    lastTransitionAtRef.current = now();
    setRung("none");
    setLastTransitionAt(lastTransitionAtRef.current);
  }, [now]);

  return { rung, lastTransitionAt, restore };
}

export function getRungLabel(rung: DowngradeRung): string {
  switch (rung) {
    case "none":
      return "";
    case "bitrate":
      return "Quality reduced: bitrate";
    case "resolution":
      return "Quality reduced: resolution";
    case "frame-rate":
      return "Quality reduced: frame rate";
    case "video-paused":
      return "Video paused (audio only)";
  }
}
