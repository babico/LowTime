import type { QualityPreset, RequestedMedia, TransportPreference } from "@lowtime/shared";

export type ViewState =
  | { kind: "home" }
  | { kind: "room"; slug: string }
  | { kind: "waiting"; slug: string; requestId: string }
  | { kind: "call"; slug: string };

export interface StoredCallSession {
  sessionId: string;
  displayName: string;
  qualityPreset: QualityPreset;
  requestedMedia: RequestedMedia;
  transportPreference: TransportPreference;
}

export interface StoredLobbyRequest {
  requestId: string;
  displayName: string;
  qualityPreset: QualityPreset;
  requestedMedia: RequestedMedia;
}

export function getViewState(pathname: string): ViewState {
  const waitingMatch = pathname.match(/^\/r\/([A-Za-z0-9]+)\/waiting\/(req_[A-Za-z0-9]+)$/);

  if (waitingMatch != null) {
    return {
      kind: "waiting",
      slug: waitingMatch[1],
      requestId: waitingMatch[2],
    };
  }

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

export function getWaitingRoute(slug: string, requestId: string): string {
  return `/r/${slug}/waiting/${requestId}`;
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

export function saveStoredLobbyRequest(storage: Storage, slug: string, request: StoredLobbyRequest) {
  storage.setItem(getStoredLobbyRequestKey(slug), JSON.stringify(request));
}

export function loadStoredLobbyRequest(storage: Storage, slug: string): StoredLobbyRequest | null {
  const raw = storage.getItem(getStoredLobbyRequestKey(slug));

  if (raw == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLobbyRequest>;

    if (
      typeof parsed.requestId !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.qualityPreset !== "string" ||
      typeof parsed.requestedMedia?.audio !== "boolean" ||
      typeof parsed.requestedMedia?.video !== "boolean"
    ) {
      return null;
    }

    return {
      requestId: parsed.requestId,
      displayName: parsed.displayName,
      qualityPreset: parsed.qualityPreset as QualityPreset,
      requestedMedia: {
        audio: parsed.requestedMedia.audio,
        video: parsed.requestedMedia.video,
      },
    };
  } catch {
    return null;
  }
}

export function clearStoredLobbyRequest(storage: Storage, slug: string) {
  storage.removeItem(getStoredLobbyRequestKey(slug));
}

export function saveStoredHostSecret(storage: Storage, slug: string, hostSecret: string) {
  storage.setItem(getStoredHostSecretKey(slug), hostSecret);
}

export function loadStoredHostSecret(storage: Storage, slug: string): string | null {
  const value = storage.getItem(getStoredHostSecretKey(slug));
  return value == null || value.trim() === "" ? null : value;
}

function getStoredCallSessionKey(slug: string): string {
  return `lowtime:call:${slug}`;
}

function getStoredLobbyRequestKey(slug: string): string {
  return `lowtime:lobby:${slug}`;
}

function getStoredHostSecretKey(slug: string): string {
  return `lowtime:host:${slug}`;
}
