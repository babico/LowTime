import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import IORedis from "ioredis";
import pg from "pg";

import {
  ensureLowtimeSchema,
  type PgClient,
  type PgConfig,
} from "./domain/pg.js";
import {
  createPgRoomMetadataStore,
  type PgRoomMetadataStore,
  type RoomMetadataCreate,
  toRoomMetadataCreate,
} from "./domain/pg-room-metadata.js";
import type { PgRoomMetadataRow as _Row } from "./domain/pg-room-metadata.js";
void (null as unknown as _Row);

function makeConfig(overrides: Partial<PgConfig> = {}): PgConfig {
  return {
    host: "192.168.21.2",
    port: 5432,
    user: "lowtime",
    password: "123456789bA+lowtime",
    database: "lowtime",
    ...overrides,
  };
}

async function pgIsReachable(): Promise<boolean> {
  let client: pg.Client | null = null;
  try {
    client = new pg.Client({
      ...makeConfig({ connectionTimeoutMs: 1500 }),
    });
    await client.connect();
    const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    if (client != null) {
      await client.end();
    }
  }
}

const reachable = await pgIsReachable();

async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new pg.Client(makeConfig());
  await client.connect();
  try {
    await ensureLowtimeSchema(client as unknown as PgClient);
    return await fn(client as unknown as PgClient);
  } finally {
    await client.end();
  }
}

function randomSlug(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function cleanup(client: PgClient, slug: string): Promise<void> {
  await client.query("DELETE FROM room_metadata WHERE slug = $1", [slug]);
}

describe("toRoomMetadataCreate", () => {
  test("maps the in-memory shape to the SQL column set", () => {
    const input: RoomMetadataCreate = {
      slug: "alpha",
      accessMode: "open",
      maxParticipants: 4,
      qualityCap: "balanced",
      allowScreenShare: true,
      createdAt: "2026-06-22T12:00:00.000Z",
    };
    const mapped = toRoomMetadataCreate(input);
    assert.equal(mapped.slug, "alpha");
    assert.equal(mapped.accessMode, "open");
    assert.equal(mapped.maxParticipants, 4);
    assert.equal(mapped.qualityCap, "balanced");
    assert.equal(mapped.allowScreenShare, true);
    assert.equal(mapped.createdAt, "2026-06-22T12:00:00.000Z");
  });
});

describe("createPgRoomMetadataStore (live PG)", () => {
  test("put then get round-trips a room row", { skip: !reachable }, async () => {
    const slug = randomSlug("roundtrip");
    await withClient(async (client) => {
      const store: PgRoomMetadataStore = createPgRoomMetadataStore({ client });
      try {
        await store.put({
          slug,
          accessMode: "open",
          maxParticipants: 4,
          qualityCap: "balanced",
          allowScreenShare: true,
          createdAt: new Date().toISOString(),
        });
        const row = await store.get(slug);
        assert.ok(row != null);
        assert.equal(row.slug, slug);
        assert.equal(row.accessMode, "open");
        assert.equal(row.maxParticipants, 4);
      } finally {
        await cleanup(client, slug);
      }
    });
  });

  test("get returns null for an unknown slug", { skip: !reachable }, async () => {
    await withClient(async (client) => {
      const store = createPgRoomMetadataStore({ client });
      const row = await store.get("slug_that_does_not_exist");
      assert.equal(row, null);
    });
  });

  test("put overwrites an existing row", { skip: !reachable }, async () => {
    const slug = randomSlug("overwrite");
    await withClient(async (client) => {
      const store = createPgRoomMetadataStore({ client });
      try {
        await store.put({
          slug,
          accessMode: "open",
          maxParticipants: 4,
          qualityCap: "balanced",
          allowScreenShare: true,
          createdAt: "2026-06-22T00:00:00.000Z",
        });
        await store.put({
          slug,
          accessMode: "lobby",
          maxParticipants: 2,
          qualityCap: "low",
          allowScreenShare: false,
          createdAt: "2026-06-22T00:00:01.000Z",
        });
        const row = await store.get(slug);
        assert.equal(row?.accessMode, "lobby");
        assert.equal(row?.maxParticipants, 2);
        assert.equal(row?.qualityCap, "low");
        assert.equal(row?.allowScreenShare, false);
      } finally {
        await cleanup(client, slug);
      }
    });
  });
});

void IORedis;
void ensureLowtimeSchema;
type _Used = _Row;
void (null as unknown as _Used);
