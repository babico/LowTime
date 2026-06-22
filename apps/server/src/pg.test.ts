import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  closePgClient,
  createPgClient,
  createPgPool,
  ensureLowtimeSchema,
  type PgClient,
  type PgConfig,
  type PgPool,
} from "./domain/pg.js";

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
  let client: PgClient | null = null;
  try {
    client = await createPgClient(makeConfig({ connectionTimeoutMs: 1500 }));
    const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    if (client != null) {
      await closePgClient(client);
    }
  }
}

const reachable = await pgIsReachable();

describe("createPgClient", () => {
  test("rejects when the config is missing required fields", async () => {
    await assert.rejects(
      () => createPgClient({ host: "", port: 5432, user: "x", password: "x", database: "x" }),
      /host/,
    );
    await assert.rejects(
      () => createPgClient({ host: "h", port: 5432, user: "", password: "x", database: "x" }),
      /user/,
    );
  });

  test("live PG: connects, runs SELECT 1, and disconnects", { skip: !reachable }, async () => {
    const client = await createPgClient(makeConfig());
    const result = await client.query<{ ok: number; now: Date }>("SELECT 1 AS ok, NOW() AS now");
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.ok, 1);
    assert.ok(result.rows[0]?.now instanceof Date);
    await closePgClient(client);
  });
});

describe("createPgPool", () => {
  test("rejects when max is below one", () => {
    assert.throws(() => createPgPool(makeConfig(), { max: 0 }), /max/);
  });

  test("live PG: pool hands out working clients", { skip: !reachable }, async () => {
    const pool: PgPool = createPgPool(makeConfig(), { max: 2 });
    const client = await pool.connect();
    try {
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
      assert.equal(result.rows[0]?.ok, 1);
    } finally {
      client.release();
    }
    await pool.end();
  });
});

describe("ensureLowtimeSchema", () => {
  test("creates the room_metadata table on a clean connection", { skip: !reachable }, async () => {
    const client = await createPgClient(makeConfig());
    try {
      await ensureLowtimeSchema(client);
      const result = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'room_metadata') AS exists",
      );
      assert.equal(result.rows[0]?.exists, true);
    } finally {
      await closePgClient(client);
    }
  });

  test("is idempotent on a second invocation", { skip: !reachable }, async () => {
    const client = await createPgClient(makeConfig());
    try {
      await ensureLowtimeSchema(client);
      await ensureLowtimeSchema(client);
    } finally {
      await closePgClient(client);
    }
  });
});
