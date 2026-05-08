import type {
  AccessMode,
  CreateRoomRequest,
  JoinRoomRequest,
  MediaTokenRequest,
  QualityCap,
  TransportPreference,
  UpdateRoomSettingsRequest,
} from "@lowtime/shared";

import type { CreateStoredRoomInput } from "./room-store.js";

const DEFAULT_MAX_PARTICIPANTS = 2;
const DEFAULT_QUALITY_CAP: QualityCap = "balanced";
const DEFAULT_ACCESS_MODE: AccessMode = "open";
const DEFAULT_ALLOW_SCREEN_SHARE = true;

const ACCESS_MODES: AccessMode[] = ["open", "lobby", "passcode"];
const QUALITY_CAPS: QualityCap[] = ["low", "balanced", "high"];

const PASSCODE_MIN_LENGTH = 4;
const PASSCODE_MAX_LENGTH = 64;
const CONTROL_CHAR_PATTERN = /\p{Cc}/u;

/**
 * Validates a raw passcode value against the rules in Requirements 1.3, 1.4,
 * and 8.2: 4 to 64 UTF-8 code points, no control characters, no leading or
 * trailing whitespace.
 *
 * The function is deliberately idempotent on valid input: the returned `value`
 * is the same string that was submitted (no silent trimming). Failure messages
 * state the rule without echoing the submitted value, which keeps passcodes
 * out of response bodies and logs (Requirement 7.3).
 */
export function validatePasscode(
  input: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof input !== "string") {
    return {
      ok: false,
      message: "passcode must be a string",
    };
  }

  if (input !== input.trim()) {
    return {
      ok: false,
      message: "passcode must not contain leading or trailing whitespace",
    };
  }

  if (CONTROL_CHAR_PATTERN.test(input)) {
    return {
      ok: false,
      message: "passcode must not contain control characters",
    };
  }

  const codePointLength = [...input].length;
  if (codePointLength < PASSCODE_MIN_LENGTH || codePointLength > PASSCODE_MAX_LENGTH) {
    return {
      ok: false,
      message: `passcode must be ${PASSCODE_MIN_LENGTH} to ${PASSCODE_MAX_LENGTH} characters`,
    };
  }

  return { ok: true, value: input };
}

export function validateCreateRoomRequest(input: CreateRoomRequest): {
  ok: true;
  value: Omit<CreateStoredRoomInput, "expiresAt"> & { passcode?: string };
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

  if (accessMode === "passcode") {
    if (input.passcode == null || input.passcode === "") {
      return {
        ok: false,
        message: "passcode is required for passcode rooms",
      };
    }

    const passcodeResult = validatePasscode(input.passcode);
    if (!passcodeResult.ok) {
      return { ok: false, message: passcodeResult.message };
    }

    return {
      ok: true,
      value: {
        accessMode,
        maxParticipants,
        qualityCap,
        allowScreenShare,
        passcode: passcodeResult.value,
      },
    };
  }

  // Stray `passcode` fields on non-passcode rooms are silently ignored
  // (Requirement 1.5). They are never hashed or stored.
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

export function validateUpdateSettingsRequest(input: UpdateRoomSettingsRequest): {
  ok: true;
  value:
    | { kind: "rotate"; passcode: string }
    | { kind: "set-passcode"; passcode: string }
    | { kind: "clear-passcode"; accessMode: Exclude<AccessMode, "passcode"> }
    | { kind: "set-quality-cap"; qualityCap: QualityCap };
} | {
  ok: false;
  message: string;
} {
  const hasAccessMode = input.accessMode !== undefined;
  const hasPasscode = input.passcode !== undefined;
  const hasQualityCap = input.qualityCap !== undefined;

  if (!hasAccessMode && !hasPasscode && !hasQualityCap) {
    return {
      ok: false,
      message: "settings update must change accessMode, passcode, or qualityCap",
    };
  }

  if (hasQualityCap && !QUALITY_CAPS.includes(input.qualityCap as QualityCap)) {
    return {
      ok: false,
      message: "qualityCap must be one of low, balanced, or high",
    };
  }

  // A qualityCap-only change carries no access-mode or passcode intent.
  if (hasQualityCap && !hasAccessMode && !hasPasscode) {
    return {
      ok: true,
      value: {
        kind: "set-quality-cap",
        qualityCap: input.qualityCap as QualityCap,
      },
    };
  }

  if (hasAccessMode && !ACCESS_MODES.includes(input.accessMode as AccessMode)) {
    return {
      ok: false,
      message: "accessMode must be one of open, lobby, or passcode",
    };
  }

  if (hasAccessMode && input.accessMode !== "passcode") {
    return {
      ok: true,
      value: {
        kind: "clear-passcode",
        accessMode: input.accessMode as Exclude<AccessMode, "passcode">,
      },
    };
  }

  if (input.passcode == null || input.passcode === "") {
    return {
      ok: false,
      message: "passcode is required for passcode rooms",
    };
  }

  const passcodeResult = validatePasscode(input.passcode);
  if (!passcodeResult.ok) {
    return { ok: false, message: passcodeResult.message };
  }

  // If accessMode is explicitly passcode the caller is setting mode + passcode;
  // if it is omitted the caller is rotating the passcode on an already-passcode
  // room. The route layer enforces that the room is actually in passcode mode.
  return {
    ok: true,
    value: hasAccessMode
      ? { kind: "set-passcode", passcode: passcodeResult.value }
      : { kind: "rotate", passcode: passcodeResult.value },
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
