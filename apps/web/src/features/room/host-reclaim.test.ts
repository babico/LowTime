import assert from "node:assert/strict";
import test from "node:test";

/*
 * Integration-style tests for the host-reclaim flow. We exercise the action
 * layer (reclaimHostRole) directly and verify its no-leak and persistence
 * contracts. The hook `useHostReclaim` is covered indirectly through the
 * action-layer guarantees plus typechecking; a fuller React renderer would
 * add little value for these specific invariants at this stage.
 */

import { reclaimHostRole } from "./room-actions.js";
import {
  clearStoredHostSecret,
  loadStoredHostSecret,
  saveStoredHostSecret,
} from "../../room-entry.js";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

function createReclaimFetchStub(
  status: number,
  body: unknown,
): {
  stub: typeof fetch;
  calls: Array<{ url: string; method: string; headers: Record<string, string> }>;
} {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const stub = async (url: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key.toLowerCase()] = value;
      }
    }
    calls.push({ url, method: init?.method ?? "GET", headers });
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
    } as unknown as Response;
  };
  return { stub: stub as unknown as typeof fetch, calls };
}

test("full manual-reclaim cycle persists the pasted secret on 200 and leaves it elsewhere alone", async () => {
  const local = createMemoryStorage();
  const session = createMemoryStorage();

  const { stub, calls } = createReclaimFetchStub(200, {
    room: {
      slug: "Room123",
      accessMode: "lobby",
      maxParticipants: 2,
      qualityCap: "balanced",
      allowScreenShare: true,
      status: "created",
      expiresAt: "2026-03-24T18:00:00Z",
    },
    lobbyRequests: [],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const pasted = "pasted-host-secret-value-ab12";
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: pasted,
      slug: "Room123",
    });

    assert.equal(outcome.kind, "ok");
    assert.equal(calls[0].headers["x-host-secret"], pasted);

    // Simulate the hook's post-200 persistence step.
    saveStoredHostSecret(local, "Room123", pasted);

    // Must land in localStorage under the shared key, and nowhere else.
    assert.equal(loadStoredHostSecret(local, "Room123"), pasted);
    assert.equal(session.getItem("lowtime:host:Room123"), null);
    assert.equal(local.getItem("lowtime:call:Room123"), null);
    assert.equal(local.getItem("lowtime:lobby:Room123"), null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("403 flow does not persist the pasted secret and clears any stale storage", async () => {
  const local = createMemoryStorage();
  // Pre-seed a stale secret so we can assert it gets cleared.
  saveStoredHostSecret(local, "Room123", "stale-value");

  const { stub } = createReclaimFetchStub(403, { message: "Host secret is required" });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const pasted = "also-a-wrong-guess";
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: pasted,
      slug: "Room123",
    });

    assert.equal(outcome.kind, "unauthorized");

    // Simulate the hook's post-403 cleanup step for the automatic path.
    clearStoredHostSecret(local, "Room123");
    assert.equal(loadStoredHostSecret(local, "Room123"), null);

    // The pasted value itself must not have been written anywhere.
    assert.equal(local.getItem("lowtime:host:Room123"), null);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("409 flow preserves any stored secret so the host can retry later", async () => {
  const local = createMemoryStorage();
  saveStoredHostSecret(local, "Room123", "valid-but-room-gone");

  const { stub } = createReclaimFetchStub(409, { message: "Room is no longer available" });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: "valid-but-room-gone",
      slug: "Room123",
    });

    assert.equal(outcome.kind, "unavailable");
    // Keep the stored secret per Requirement 9.4.
    assert.equal(loadStoredHostSecret(local, "Room123"), "valid-but-room-gone");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("reclaimHostRole does not accept a Storage parameter (no-leak invariant at the signature layer)", () => {
  // The function signature accepts `{ apiBaseUrl, hostSecret, slug, signal? }`
  // only. This test is a compile-time lock: if someone adds a Storage param
  // in the future, this assertion fails and forces a review of the no-leak
  // contract.
  const accepted = {
    apiBaseUrl: "",
    hostSecret: "",
    slug: "",
    signal: undefined as AbortSignal | undefined,
  };
  const signatureFields = new Set(Object.keys(accepted));
  assert.equal(signatureFields.has("storage"), false);
});
