import pg, { type Client, type ClientConfig, type Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

/**
 * PostgreSQL client + pool wrappers for LowTime (Issue #32, slice 1).
 *
 * The helpers stay thin so domain code can keep using a plain
 * query API. Connection management, retry, and pooling are
 * delegated to `pg` so we do not reinvent the wheel.
 *
 * The migration runner ships the schema that the in-memory store
 * already manages; once durable state is wired in, the in-memory
 * store becomes a thin in-process cache backed by the same SQL.
 */

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionTimeoutMs?: number;
}

export interface PgClient {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<R>>;
  end(): Promise<void>;
}

export interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

function clipPort(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 5432;
}

function clipTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 5_000;
}

function validateConfig(config: PgConfig): void {
  if (typeof config.host !== "string" || config.host.length === 0) {
    throw new Error("PgConfig.host is required");
  }
  if (typeof config.user !== "string" || config.user.length === 0) {
    throw new Error("PgConfig.user is required");
  }
  if (typeof config.password !== "string") {
    throw new Error("PgConfig.password is required");
  }
  if (typeof config.database !== "string" || config.database.length === 0) {
    throw new Error("PgConfig.database is required");
  }
}

function buildClientConfig(config: PgConfig): ClientConfig {
  return {
    host: config.host,
    port: clipPort(config.port),
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: clipTimeout(config.connectionTimeoutMs),
  };
}

function buildPoolConfig(config: PgConfig, overrides: PoolConfig = {}): PoolConfig {
  return {
    ...buildClientConfig(config),
    ...overrides,
  };
}

function wrapClient(client: Client): PgClient {
  return {
    async query(text, params) {
      return client.query(text, params as never[]);
    },
    async end() {
      await client.end();
    },
  };
}

export async function createPgClient(config: PgConfig): Promise<PgClient> {
  validateConfig(config);
  const client = new pg.Client(buildClientConfig(config));
  await client.connect();
  return wrapClient(client);
}

export function createPgPool(config: PgConfig, overrides: PoolConfig = {}): PgPool {
  validateConfig(config);

  const max = overrides.max ?? 5;
  if (typeof max !== "number" || !Number.isFinite(max) || max < 1) {
    throw new Error("createPgPool: max must be a positive integer");
  }

  const pool = new pg.Pool(buildPoolConfig(config, { ...overrides, max }));

  return {
    async connect() {
      const client = await pool.connect();
      return {
        async query(text, params) {
          return client.query(text, params as never[]);
        },
        release: () => client.release(),
        async end() {
          await client.end();
        },
      } as PgClient & { release: () => void };
    },
    async end() {
      await pool.end();
    },
  };
}

export async function closePgClient(client: PgClient): Promise<void> {
  await client.end();
}

/**
 * Idempotent migration that creates the durable schema LowTime
 * relies on. Slice 1 only ships `room_metadata`; later slices add
 * `lobby_requests`, `chat_messages`, and the rest.
 */
export async function ensureLowtimeSchema(client: PgClient): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS room_metadata (
       slug TEXT PRIMARY KEY,
       created_at TIMESTAMPTZ NOT NULL,
       last_activity_at TIMESTAMPTZ NOT NULL,
       closed_at TIMESTAMPTZ,
       status TEXT NOT NULL
     )`,
  );
  await client.query(
    "CREATE INDEX IF NOT EXISTS room_metadata_last_activity_at_idx ON room_metadata (last_activity_at)",
  );
}
