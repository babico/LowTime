import test from "node:test";
import assert from "node:assert/strict";

import {
  attachInstallPromptListeners,
  isPwaInstalled,
  promptForInstallation,
  shouldRegisterServiceWorker,
  type BeforeInstallPromptEvent,
} from "./pwa.js";

test("isPwaInstalled returns true for standalone display mode", () => {
  assert.equal(
    isPwaInstalled({
      matchMedia: () => ({ matches: true }),
    }),
    true,
  );
});

test("isPwaInstalled returns true for iOS standalone navigator flag", () => {
  assert.equal(
    isPwaInstalled({
      navigator: { standalone: true } as Navigator & { standalone?: boolean },
    }),
    true,
  );
});

test("isPwaInstalled returns false when app is not installed", () => {
  assert.equal(
    isPwaInstalled({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false } as Navigator & { standalone?: boolean },
    }),
    false,
  );
});

test("attachInstallPromptListeners captures the deferred install event", () => {
  const target = new EventTarget();
  let promptEvent: BeforeInstallPromptEvent | null = null;
  let installedCount = 0;

  const cleanup = attachInstallPromptListeners(target, {
    onPromptAvailable: (event) => {
      promptEvent = event;
    },
    onInstalled: () => {
      installedCount += 1;
    },
  });

  const beforeInstallPromptEvent = createBeforeInstallPromptEvent();
  target.dispatchEvent(beforeInstallPromptEvent);
  target.dispatchEvent(new Event("appinstalled"));
  cleanup();

  assert.equal(promptEvent, beforeInstallPromptEvent);
  assert.equal(beforeInstallPromptEvent.defaultPrevented, true);
  assert.equal(installedCount, 1);
});

test("promptForInstallation returns the browser choice outcome", async () => {
  const deferredPrompt = createBeforeInstallPromptEvent("accepted");
  assert.equal(await promptForInstallation(deferredPrompt), "accepted");
});

test("shouldRegisterServiceWorker only enables production browser registration", () => {
  assert.equal(shouldRegisterServiceWorker({ PROD: true }, {} as Navigator["serviceWorker"]), true);
  assert.equal(shouldRegisterServiceWorker({ PROD: false }, {} as Navigator["serviceWorker"]), false);
  assert.equal(shouldRegisterServiceWorker({ PROD: true }, undefined), false);
});

function createBeforeInstallPromptEvent(
  outcome: "accepted" | "dismissed" = "dismissed",
): BeforeInstallPromptEvent {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;

  Object.defineProperties(event, {
    prompt: {
      value: async () => {},
    },
    userChoice: {
      value: Promise.resolve({ outcome, platform: "web" }),
    },
  });

  return event;
}
