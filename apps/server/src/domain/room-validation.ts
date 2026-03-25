import type {
  AccessMode,
  CreateRoomRequest,
  JoinRoomRequest,
  MediaTokenRequest,
  QualityCap,
  TransportPreference,
} from "@lowtime/shared";

import type { CreateStoredRoomInput } from "./room-store.js";

const DEFAULT_MAX_PARTICIPANTS = 2;
const DEFAULT_QUALITY_CAP: QualityCap = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
const DEFAULT_ALLOW_SCREEN_SHARE = true;

const ACCESS_MODES: AccessMode[] = ["open", "lobby", "passcode"];
const QUALITY_CAPS: QualityCap[] = ["low", "balanced", "high"];

export function validateCreateRoomRequest(input: CreateRoomRequest): {
  ok: true;
  value: Omit<CreateStoredRoomInput, "expiresAt">;
} | {
  ok: false;
  message: string;
} {
  const accessMode = input.accessMode ?? DEFAULT_ACCESS_MODE;
  const maxParticipants = input.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
  const qualityCap = input.qualityCap ?? DEFAULT_QUALITY_CAP;
  const allowScreenShare = input.allowScreenShare ?? DEFAULT_ALLOW_SCREEN_SHARE;

  if (!ACCESS_MODES.includes(accessMode)) {
    return {
      ok: false,
      message: "accessMode must be one of open, lobby, or passcode",
    };
  }

  if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 4) {
    return {
      ok: false,
      message: "maxParticipants must be an integer between 2 and 4",
    };
  }

  if (!QUALITY_CAPS.includes(qualityCap)) {
    return {
      ok: false,
      message: "qualityCap must be one of low, balanced, or high",
    };
  }

  if (typeof allowScreenShare !== "boolean") {
    return {
      ok: false,
      message: "allowScreenShare must be a boolean",
    };
  }

  return {
    ok: true,
    value: {
      accessMode,
      maxParticipants,
      qualityCap,
      allowScreenShare,
    },
  };
}

export function validateJoinRoomRequest(input: JoinRoomRequest): {
  ok: true;
  value: Required<Pick<JoinRoomRequest, "displayName">> & JoinRoomRequest;
} | {
  ok: false;
  message: string;
} {
  const displayName = input.displayName?.trim();

  if (displayName == null || displayName.length === 0) {
    return {
      ok: false,
      message: "displayName is required",
    };
  }

  if (displayName.length > 40) {
    return {
      ok: false,
      message: "displayName must be 40 characters or fewer",
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      displayName,
    },
  };
}

export function validateMediaTokenRequest(input: MediaTokenRequest): {
  ok: true;
  value: Required<Pick<MediaTokenRequest, "sessionId" | "transportPreference">> & MediaTokenRequest;
} | {
  ok: false;
  message: string;
} {
  const sessionId = input.sessionId?.trim();
  const transportPreference: TransportPreference = input.transportPreference ?? "sfu";

  if (sessionId == null || sessionId === "") {
    return {
      ok: false,
      message: "sessionId is required",
    };
  }

  if (!["sfu", "p2p"].includes(transportPreference)) {
    return {
      ok: false,
      message: "transportPreference must be sfu or p2p",
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      sessionId,
      transportPreference,
    },
  };
}
