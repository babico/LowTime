/**
 * sessionStorage-backed persistence for the user-selected camera and
 * microphone (Issue #97).
 *
 * Pure so the join page and the call page can share one helper, and
 * tests can use a plain object instead of hitting the global
 * sessionStorage. The storage key is namespaced under "lowtime:" so
 * the project does not collide with anything else the page might
 * write.
 */

export const DEVICE_CHOICE_STORAGE_KEY = "lowtime:device-choice";

export interface DeviceChoiceEntry {
  cameraId: string;
  microphoneId: string;
}

export interface DeviceChoiceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveDeviceChoiceInput {
  storage: DeviceChoiceStorageLike;
  entry: DeviceChoiceEntry;
}

export interface LoadDeviceChoiceInput {
  storage: DeviceChoiceStorageLike;
}

export interface ClearDeviceChoiceInput {
  storage: DeviceChoiceStorageLike;
}

function isDeviceChoiceEntry(value: unknown): value is DeviceChoiceEntry {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.cameraId === "string" &&
    candidate.cameraId !== "" &&
    typeof candidate.microphoneId === "string" &&
    candidate.microphoneId !== ""
  );
}

export function saveDeviceChoice(input: SaveDeviceChoiceInput): void {
  input.storage.setItem(
    DEVICE_CHOICE_STORAGE_KEY,
    JSON.stringify({
      cameraId: input.entry.cameraId,
      microphoneId: input.entry.microphoneId,
    }),
  );
}

export function loadDeviceChoice(input: LoadDeviceChoiceInput): DeviceChoiceEntry | null {
  const raw = input.storage.getItem(DEVICE_CHOICE_STORAGE_KEY);
  if (raw == null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isDeviceChoiceEntry(parsed)) {
    return null;
  }

  return { cameraId: parsed.cameraId, microphoneId: parsed.microphoneId };
}

export function clearDeviceChoice(input: ClearDeviceChoiceInput): void {
  input.storage.removeItem(DEVICE_CHOICE_STORAGE_KEY);
}
