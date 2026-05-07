import { useEffect, useState } from "react";

import {
  attachInstallPromptListeners,
  isPwaInstalled,
  promptForInstallation,
  type BeforeInstallPromptEvent,
} from "../../pwa.js";

export function useInstallPrompt() {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [isInstallingApp, setIsInstallingApp] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(() => getStandaloneAppState());

  useEffect(() => {
    setIsStandaloneApp(getStandaloneAppState());

    return attachInstallPromptListeners(window, {
      onPromptAvailable: (event) => {
        setDeferredInstallPrompt(event);
        setInstallMessage("Install LowTime for faster access from your home screen.");
      },
      onInstalled: () => {
        setDeferredInstallPrompt(null);
        setIsInstallingApp(false);
        setIsStandaloneApp(true);
        setInstallMessage("LowTime is installed and ready to launch like an app.");
      },
    });
  }, []);

  async function handleInstallApp() {
    if (deferredInstallPrompt == null) {
      return;
    }

    setIsInstallingApp(true);

    try {
      const outcome = await promptForInstallation(deferredInstallPrompt);
      setDeferredInstallPrompt(null);
      setInstallMessage(
        outcome === "accepted"
          ? "Install accepted. Your browser will finish adding LowTime."
          : "Install dismissed. You can still add LowTime from your browser menu later.",
      );
    } finally {
      setIsInstallingApp(false);
    }
  }

  return {
    handleInstallApp,
    installMessage,
    isInstallingApp,
    isStandaloneApp,
    showInstallPrompt: deferredInstallPrompt != null,
  };
}

function getStandaloneAppState() {
  return isPwaInstalled({
    matchMedia: typeof window === "undefined" ? undefined : window.matchMedia.bind(window),
    navigator: typeof navigator === "undefined" ? undefined : navigator,
  });
}
