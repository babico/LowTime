import assert from "node:assert/strict";
import test from "node:test";

import {
  clearDeviceChoice,
  loadDeviceChoice,
  saveDeviceChoice,
} from "./device-choice-storage.js";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function makeEntry(overrides: Partial<{ cameraId: string; microphoneId: string }> = {}) {
  return { cameraId: "cam-1", microphoneId: "mic-1", ...overrides };
}

test("saveDeviceChoice writes both ids to the named storage key", () => {
  const storage = makeStorage();
  saveDeviceChoice({ storage, entry: makeEntry() });

  const raw = storage.getItem("lowtime:device-choice");
  assert.equal(typeof raw, "string");
  const parsed = JSON.parse(raw as string) as { cameraId: string; microphoneId: string };
  assert.equal(parsed.cameraId, "cam-1");
  assert.equal(parsed.microphoneId, "mic-1");
});

test("loadDeviceChoice returns the entry on a happy path", () => {
  const storage = makeStorage();
  saveDeviceChoice({ storage, entry: makeEntry({ cameraId: "cam-9" }) });

  const loaded = loadDeviceChoice({ storage });
  assert.deepEqual(loaded, { cameraId: "cam-9", microphoneId: "mic-1" });
});

test("loadDeviceChoice returns null when nothing is stored", () => {
  const storage = makeStorage();
  assert.equal(loadDeviceChoice({ storage }), null);
});

test("loadDeviceChoice returns null when the stored value is not valid JSON", () => {
  const storage = makeStorage();
  storage.setItem("lowtime:device-choice", "{not json");
  assert.equal(loadDeviceChoice({ storage }), null);
});

test("loadDeviceChoice returns null when required fields are missing", () => {
  const storage = makeStorage();
  storage.setItem("lowtime:device-choice", JSON.stringify({ cameraId: "cam-1" }));
  assert.equal(loadDeviceChoice({ storage }), null);
});

test("loadDeviceChoice returns null when the storage entry is not a string", () => {
  const storage = makeStorage();
  storage.setItem("lowtime:device-choice", "123");
  assert.equal(loadDeviceChoice({ storage }), null);
});

test("clearDeviceChoice removes the storage entry", () => {
  const storage = makeStorage();
  saveDeviceChoice({ storage, entry: makeEntry() });
  clearDeviceChoice({ storage });
  assert.equal(storage.getItem("lowtime:device-choice"), null);
});

test("saveDeviceChoice overwrites a previous entry", () => {
  const storage = makeStorage();
  saveDeviceChoice({ storage, entry: makeEntry({ cameraId: "cam-old" }) });
  saveDeviceChoice({ storage, entry: makeEntry({ cameraId: "cam-new" }) });

  const loaded = loadDeviceChoice({ storage });
  assert.equal(loaded?.cameraId, "cam-new");
});
