import { useCallback, useEffect, useRef, useState } from "react";

import type { DowngradeRung } from "./auto-downgrade.js";

export type PromptState = "hidden" | "suggested" | "accepted" | "dismissed";

export const PROMPT_TRIGGER_MS = 30_000;
export const DISMISS_COOLDOWN_MS = 60_000;

export interface ComputePromptStateInput {
  now: number;
  rung: DowngradeRung;
  lastRungTransitionAt: number;
  currentState: PromptState;
  dismissedAt: number | null;
}

export interface ComputePromptStateResult {
  next: PromptState;
  dismissedAt: number | null;
}

/**
 * Pure state-machine step for the audio-only prompt.
 *
 *   hidden → suggested: fires when the downgrade ladder has held
 *     `"video-paused"` for at least `PROMPT_TRIGGER_MS` without a
 *     user-initiated restore (`lastRungTransitionAt` marks when the rung
 *     was set, which the auto-downgrade hook owns).
 *   suggested → accepted: terminal for the rest of the call.
 *   suggested → dismissed: 60-second cooldown before `hidden → suggested`
 *     can fire again.
 *
 * Any rung that is NOT `"video-paused"` forces the state back to
 * `"hidden"` and clears any pending dismiss cooldown; the user resumed
 * video one way or another and should not carry stale prompt state.
 */
export function computePromptState(
  input: ComputePromptStateInput,
): ComputePromptStateResult {
  const { now, rung, lastRungTransitionAt, currentState, dismissedAt } = input;

  if (rung !== "video-paused") {
    return { next: "hidden", dismissedAt: null };
  }

  if (currentState === "accepted") {
    return { next: "accepted", dismissedAt };
  }

  if (currentState === "dismissed") {
    if (dismissedAt != null && now - dismissedAt >= DISMISS_COOLDOWN_MS) {
      // Re-eligible; fall through to the "suggested" logic below.
      return evaluateTrigger(now, lastRungTransitionAt, "hidden", null);
    }
    return { next: "dismissed", dismissedAt };
  }

  return evaluateTrigger(now, lastRungTransitionAt, currentState, dismissedAt);
}

function evaluateTrigger(
  now: number,
  lastRungTransitionAt: number,
  currentState: PromptState,
  dismissedAt: number | null,
): ComputePromptStateResult {
  const streak = now - lastRungTransitionAt;
  if (streak >= PROMPT_TRIGGER_MS && currentState === "hidden") {
    return { next: "suggested", dismissedAt: null };
  }
  return { next: currentState, dismissedAt };
}

export interface UseAudioOnlyPromptInput {
  rung: DowngradeRung;
  lastRungTransitionAt: number;
  now?: () => number;
  intervalMs?: number;
}

export interface UseAudioOnlyPromptState {
  promptState: PromptState;
  accept: () => void;
  dismiss: () => void;
}

const DEFAULT_INTERVAL_MS = 3_000;

export function useAudioOnlyPrompt(
  input: UseAudioOnlyPromptInput,
): UseAudioOnlyPromptState {
  const now = input.now ?? (() => Date.now());
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;

  const [promptState, setPromptState] = useState<PromptState>("hidden");
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const stateRef = useRef<PromptState>("hidden");
  const dismissedAtRef = useRef<number | null>(null);
  stateRef.current = promptState;
  dismissedAtRef.current = dismissedAt;

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const result = computePromptState({
        now: now(),
        rung: input.rung,
        lastRungTransitionAt: input.lastRungTransitionAt,
        currentState: stateRef.current,
        dismissedAt: dismissedAtRef.current,
      });
      if (result.next !== stateRef.current) {
        setPromptState(result.next);
      }
      if (result.dismissedAt !== dismissedAtRef.current) {
        setDismissedAt(result.dismissedAt);
      }
    };

    // Evaluate eagerly on any rung change; this covers the "leaves
    // video-paused" reset without waiting for a tick.
    tick();

    if (input.rung !== "video-paused") {
      return () => {
        cancelled = true;
      };
    }

    const handle = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [input.rung, input.lastRungTransitionAt, intervalMs, now]);

  const accept = useCallback(() => {
    setPromptState("accepted");
    setDismissedAt(null);
  }, []);

  const dismiss = useCallback(() => {
    setPromptState("dismissed");
    setDismissedAt(now());
  }, [now]);

  return { promptState, accept, dismiss };
}
