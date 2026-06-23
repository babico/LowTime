import assert from "node:assert/strict";
import test from "node:test";

import {
  filterDeviceList,
  listMediaDevices,
  switchActiveDevice,
} from "./device-switcher.js";

function makeMediaDevice(kind: MediaDeviceKind, deviceId: string, label = ""): MediaDeviceInfo {
  return {
    deviceId,
    kind,
    label,
    groupId: `group-${deviceId}`,
    toJSON() {
      return {};
    },
  } as MediaDeviceInfo;
}

test("listMediaDevices separates cameras and microphones and surfaces ids and labels", () => {
  const cameras = [makeMediaDevice("videoinput", "cam-1", "Front camera")];
  const microphones = [makeMediaDevice("audioinput", "mic-1", "Default mic")];
  const speakers = [makeMediaDevice("audiooutput", "spk-1", "Speaker")];

  const result = listMediaDevices([...cameras, ...microphones, ...speakers]);

  assert.deepEqual(result.cameras, [{ deviceId: "cam-1", label: "Front camera" }]);
  assert.deepEqual(result.microphones, [{ deviceId: "mic-1", label: "Default mic" }]);
  assert.equal(result.speakers, undefined);
});

test("listMediaDevices returns empty arrays when there are no devices", () => {
  const result = listMediaDevices([]);

  assert.deepEqual(result.cameras, []);
  assert.deepEqual(result.microphones, []);
});

test("listMediaDevices tolerates a missing or partial enumerateDevices surface", () => {
  const result = listMediaDevices(undefined);

  assert.deepEqual(result.cameras, []);
  assert.deepEqual(result.microphones, []);
});

test("listMediaDevices keeps only devices with a non-empty deviceId", () => {
  const cameras = [
    makeMediaDevice("videoinput", "cam-1", "Front"),
    makeMediaDevice("videoinput", "", "No id"),
  ];

  const result = listMediaDevices(cameras);

  assert.deepEqual(result.cameras, [{ deviceId: "cam-1", label: "Front" }]);
});

test("filterDeviceList drops the placeholder default entry when real devices are present", () => {
  const devices = [
    { deviceId: "default", label: "" },
    { deviceId: "cam-1", label: "Front" },
  ];

  const filtered = filterDeviceList(devices);

  assert.deepEqual(filtered, [{ deviceId: "cam-1", label: "Front" }]);
});

test("filterDeviceList keeps the placeholder when no real devices are present", () => {
  const devices = [{ deviceId: "default", label: "" }];

  const filtered = filterDeviceList(devices);

  assert.deepEqual(filtered, [{ deviceId: "default", label: "" }]);
});

test("switchActiveDevice forwards the right kind to LocalParticipant.switchActiveDevice", async () => {
  const calls: Array<{ kind: string; deviceId: string }> = [];
  const room = {
    localParticipant: {
      switchActiveDevice: async (kind: "videoinput" | "audioinput", deviceId: string) => {
        calls.push({ kind, deviceId });
      },
    },
  };

  const result = await switchActiveDevice({ room, kind: "videoinput", deviceId: "cam-2" });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ kind: "videoinput", deviceId: "cam-2" }]);
});

test("switchActiveDevice maps 'camera' and 'microphone' aliases to MediaDeviceKind", async () => {
  const calls: Array<{ kind: string; deviceId: string }> = [];
  const room = {
    localParticipant: {
      switchActiveDevice: async (kind: "videoinput" | "audioinput", deviceId: string) => {
        calls.push({ kind, deviceId });
      },
    },
  };

  await switchActiveDevice({ room, kind: "camera", deviceId: "cam-2" });
  await switchActiveDevice({ room, kind: "microphone", deviceId: "mic-2" });

  assert.deepEqual(calls, [
    { kind: "videoinput", deviceId: "cam-2" },
    { kind: "audioinput", deviceId: "mic-2" },
  ]);
});

test("switchActiveDevice surfaces an error when the room API is missing", async () => {
  const result = await switchActiveDevice({ room: null, kind: "camera", deviceId: "cam-2" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not connected/i);
  }
});

test("switchActiveDevice surfaces an error when the kind is unknown", async () => {
  const room = {
    localParticipant: {
      switchActiveDevice: async () => {
        // never reached
      },
    },
  };

  const result = await switchActiveDevice({
    room,
    kind: "speaker" as unknown as "videoinput",
    deviceId: "spk-1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /kind/i);
  }
});

test("switchActiveDevice forwards the underlying error message", async () => {
  const room = {
    localParticipant: {
      switchActiveDevice: async () => {
        throw new Error("device busy");
      },
    },
  };

  const captured: string[] = [];
  const result = await switchActiveDevice({
    room,
    kind: "microphone",
    deviceId: "mic-1",
    onError: (message) => captured.push(message),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(captured, ["device busy"]);
});
