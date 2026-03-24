import type { QualityPreset, RequestedMedia, TransportPreference } from "@lowtime/shared";

export type ViewState =
  | { kind: "home" }
  | { kind: "room"; slug: string }
  | { kind: "call"; slug: string };

export interface StoredCallSession {
  sessionId: string;
  displayName: string;
  qualityPreset: QualityPreset;
  requestedMedia: RequestedMedia;
  transportPreference: TransportPreference;
}

export function getViewState(pathname: string): ViewState {
  const callMatch = pathname.match(/^\/r\/([A-Za-z0-9]+)\/call$/);

  if (callMatch != null) {
    return {
      kind: "call",
      slug: callMatch[1],
    };
  }

  const roomMatch = pathname.match(/^\/r\/([A-Za-z0-9]+)$/);

  if (roomMatch != null) {
    return {
      kind: "room",
      slug: roomMatch[1],
    };
  }

  return { kind: "home" };
}

export function getApiBaseUrl(configuredBaseUrl: string | undefined, location: Location): string {
  if (configuredBaseUrl != null && configuredBaseUrl.trim() !== "") {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const protocol = location.protocol === "https:" ? "https:" : "http:";
  const hostname = location.hostname || "localhost";
  return `${protocol}//${hostname}:3000`;
}

export function buildRequestedMedia(audio: boolean, video: boolean): RequestedMedia {
  return {
    audio,
    video,
  };
}

export function getCallRoute(slug: string): string {
  return `/r/${slug}/call`;
}

export function saveStoredCallSession(storage: Storage, slug: string, session: StoredCallSession) {
  storage.setItem(getStoredCallSessionKey(slug), JSON.stringify(session));
}

export function loadStoredCallSession(storage: Storage, slug: string): StoredCallSession | null {
  const raw = storage.getItem(getStoredCallSessionKey(slug));

  if (raw == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredCallSession>;

    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.qualityPreset !== "string" ||
      typeof parsed.transportPreference !== "string" ||
      typeof parsed.requestedMedia?.audio !== "boolean" ||
      typeof parsed.requestedMedia?.video !== "boolean"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      displayName: parsed.displayName,
      qualityPreset: parsed.qualityPreset as QualityPreset,
      transportPreference: parsed.transportPreference as TransportPreference,
      requestedMedia: {
        audio: parsed.requestedMedia.audio,
        video: parsed.requestedMedia.video,
      },
    };
  } catch {
    return null;
  }
}

export function clearStoredCallSession(storage: Storage, slug: string) {
  storage.removeItem(getStoredCallSessionKey(slug));
}

function getStoredCallSessionKey(slug: string): string {
  return `lowtime:call:${slug}`;
}
