/**
 * Device switching helpers.
 *
 * Wraps the small pieces of the MediaDevices and LiveKit APIs that the call
 * page needs in order to list the user's cameras and microphones and to
 * switch the active device on a connected LiveKit room. Speaker output
 * selection is intentionally out of scope (browser support is still too
 * narrow) and is tracked separately.
 */

export type DeviceSwitchKind = "videoinput" | "audioinput" | "camera" | "microphone";

export interface MediaDeviceEntry {
  deviceId: string;
  label: string;
}

export interface ListMediaDevicesResult {
  cameras: MediaDeviceEntry[];
  microphones: MediaDeviceEntry[];
  speakers?: MediaDeviceEntry[];
}

export interface DeviceSwitchRoomLike {
  localParticipant: {
    switchActiveDevice(kind: "videoinput" | "audioinput", deviceId: string): Promise<void>;
  };
}

export interface SwitchActiveDeviceInput {
  room: DeviceSwitchRoomLike | null;
  kind: DeviceSwitchKind;
  deviceId: string;
  onError?: (message: string) => void;
}

export type SwitchActiveDeviceResult =
  | { ok: true }
  | { ok: false; message: string };

const KIND_TO_MEDIA_KIND: Record<DeviceSwitchKind, "videoinput" | "audioinput" | null> = {
  videoinput: "videoinput",
  audioinput: "audioinput",
  camera: "videoinput",
  microphone: "audioinput",
};

const DEFAULT_DEVICE_IDS = new Set(["default", "communications"]);

function toEntry(device: MediaDeviceInfo): MediaDeviceEntry | null {
  if (typeof device.deviceId !== "string" || device.deviceId === "") {
    return null;
  }

  return { deviceId: device.deviceId, label: device.label };
}

export function listMediaDevices(devices: MediaDeviceInfo[] | undefined | null): ListMediaDevicesResult {
  if (devices == null) {
    return { cameras: [], microphones: [] };
  }

  const cameras: MediaDeviceEntry[] = [];
  const microphones: MediaDeviceEntry[] = [];

  for (const device of devices) {
    const entry = toEntry(device);
    if (entry == null) {
      continue;
    }

    if (device.kind === "videoinput") {
      cameras.push(entry);
    } else if (device.kind === "audioinput") {
      microphones.push(entry);
    }
  }

  return { cameras, microphones };
}

export function filterDeviceList(devices: MediaDeviceEntry[]): MediaDeviceEntry[] {
  const real = devices.filter((device) => !DEFAULT_DEVICE_IDS.has(device.deviceId) && device.deviceId !== "");

  if (real.length > 0) {
    return real;
  }

  return devices;
}

export async function switchActiveDevice(
  input: SwitchActiveDeviceInput,
): Promise<SwitchActiveDeviceResult> {
  if (input.room == null) {
    const message = "Device switching is unavailable because the call is not connected.";
    input.onError?.(message);
    return { ok: false, message };
  }

  const mediaKind = KIND_TO_MEDIA_KIND[input.kind];

  if (mediaKind == null) {
    const message = `Unknown device kind: ${input.kind}`;
    input.onError?.(message);
    return { ok: false, message };
  }

  if (typeof input.deviceId !== "string" || input.deviceId === "") {
    const message = "Pick a device before switching.";
    input.onError?.(message);
    return { ok: false, message };
  }

  try {
    await input.room.localParticipant.switchActiveDevice(mediaKind, input.deviceId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to switch device";
    input.onError?.(message);
    return { ok: false, message };
  }
}
