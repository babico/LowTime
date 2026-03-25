export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface InstallPromptBindings {
  onPromptAvailable: (event: BeforeInstallPromptEvent) => void;
  onInstalled: () => void;
}

interface InstallPromptTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface StandaloneEnvironment {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: Navigator & { standalone?: boolean };
}

interface ServiceWorkerEnvironment {
  PROD: boolean;
}

export function isPwaInstalled(environment: StandaloneEnvironment = {}): boolean {
  const matchesStandalone = environment.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const navigatorStandalone = environment.navigator?.standalone === true;

  return matchesStandalone || navigatorStandalone;
}

export function attachInstallPromptListeners(
  target: InstallPromptTarget,
  bindings: InstallPromptBindings,
): () => void {
  const handleBeforeInstallPrompt: EventListener = (event) => {
    if (!isBeforeInstallPromptEvent(event)) {
      return;
    }

    event.preventDefault();
    bindings.onPromptAvailable(event);
  };

  const handleInstalled: EventListener = () => {
    bindings.onInstalled();
  };

  target.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  target.addEventListener("appinstalled", handleInstalled);

  return () => {
    target.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    target.removeEventListener("appinstalled", handleInstalled);
  };
}

export async function promptForInstallation(
  deferredPrompt: BeforeInstallPromptEvent,
): Promise<"accepted" | "dismissed"> {
  await deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  return result.outcome;
}

export function shouldRegisterServiceWorker(
  environment: ServiceWorkerEnvironment,
  serviceWorker: Navigator["serviceWorker"] | undefined,
): boolean {
  return environment.PROD && serviceWorker != null;
}

export function registerServiceWorker(
  environment: ServiceWorkerEnvironment,
  target: Window,
): void {
  if (!shouldRegisterServiceWorker(environment, target.navigator.serviceWorker)) {
    return;
  }

  const register = () => {
    void target.navigator.serviceWorker?.register("/service-worker.js");
  };

  if (target.document.readyState === "complete") {
    register();
    return;
  }

  target.addEventListener("load", register, { once: true });
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return typeof (event as Partial<BeforeInstallPromptEvent>).prompt === "function";
}
