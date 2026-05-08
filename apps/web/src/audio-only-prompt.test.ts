import assert from "node:assert/strict";
import test from "node:test";

import {
  computePromptState,
  DISMISS_COOLDOWN_MS,
  PROMPT_TRIGGER_MS,
  type PromptState,
} from "./audio-only-prompt.js";

test("computePromptState: returns hidden when rung is not video-paused (from any state)", () => {
  const states: PromptState[] = ["hidden", "suggested", "accepted", "dismissed"];
  for (const state of states) {
    const result = computePromptState({
      now: 1_000_000,
      rung: "none",
      lastRungTransitionAt: 0,
      currentState: state,
      dismissedAt: 500_000,
    });
    assert.equal(result.next, "hidden", `state=${state} should reset to hidden off-rung`);
    assert.equal(result.dismissedAt, null);
  }
});

test("computePromptState: fires suggested after the trigger window elapses", () => {
  const result = computePromptState({
    now: PROMPT_TRIGGER_MS,
    rung: "video-paused",
    lastRungTransitionAt: 0,
    currentState: "hidden",
    dismissedAt: null,
  });
  assert.equal(result.next, "suggested");
  assert.equal(result.dismissedAt, null);
});

test("computePromptState: holds at hidden while the streak is below the trigger", () => {
  const result = computePromptState({
    now: PROMPT_TRIGGER_MS - 1,
    rung: "video-paused",
    lastRungTransitionAt: 0,
    currentState: "hidden",
    dismissedAt: null,
  });
  assert.equal(result.next, "hidden");
});

test("computePromptState: accepted is terminal while on video-paused", () => {
  const result = computePromptState({
    now: 10 * PROMPT_TRIGGER_MS,
    rung: "video-paused",
    lastRungTransitionAt: 0,
    currentState: "accepted",
    dismissedAt: null,
  });
  assert.equal(result.next, "accepted");
});

test("computePromptState: dismissed re-suggests after the cooldown elapses", () => {
  const dismissedAt = 1_000_000;
  // Before cooldown: stay dismissed.
  const duringCooldown = computePromptState({
    now: dismissedAt + DISMISS_COOLDOWN_MS - 1,
    rung: "video-paused",
    lastRungTransitionAt: 0,
    currentState: "dismissed",
    dismissedAt,
  });
  assert.equal(duringCooldown.next, "dismissed");

  // After cooldown + the trigger window: re-suggest.
  const afterCooldown = computePromptState({
    now: dismissedAt + DISMISS_COOLDOWN_MS + PROMPT_TRIGGER_MS,
    rung: "video-paused",
    lastRungTransitionAt: dismissedAt + DISMISS_COOLDOWN_MS,
    currentState: "dismissed",
    dismissedAt,
  });
  assert.equal(afterCooldown.next, "suggested");
});

test("computePromptState: dismissed holds if the trigger window has not re-elapsed", () => {
  const dismissedAt = 1_000_000;
  const result = computePromptState({
    // Cooldown elapsed but the rung streak is young.
    now: dismissedAt + DISMISS_COOLDOWN_MS + 100,
    rung: "video-paused",
    lastRungTransitionAt: dismissedAt + DISMISS_COOLDOWN_MS + 50,
    currentState: "dismissed",
    dismissedAt,
  });
  // The helper cleared dismissed, but the streak is only 50 ms so stays hidden.
  assert.equal(result.next, "hidden");
});

test("computePromptState: the state never transitions backward on its own", () => {
  // suggested is idempotent while rung holds and the streak is above the trigger.
  const result = computePromptState({
    now: 2 * PROMPT_TRIGGER_MS,
    rung: "video-paused",
    lastRungTransitionAt: 0,
    currentState: "suggested",
    dismissedAt: null,
  });
  assert.equal(result.next, "suggested");
});
