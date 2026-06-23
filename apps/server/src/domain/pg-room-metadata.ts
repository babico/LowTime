import type { AccessMode, QualityCap, RoomSlug } from "@lowtime/shared";

import type { PgClient } from "./pg.js";

/**
 * PG-backed room metadata store (Issue #32 slice 2).
 *
 * The current RoomStore in `domain/room-store.ts` keeps every
 * piece of state in process memory. This module adds the
 * smallest durable piece: a `room_metadata` table that survives
 * a process restart. Sessions, lobby requests, and rate
 * limiter state still live in memory (or in Redis once the
 * #33 wiring lands); this slice just makes the room-level
 * metadata durable so the next slice can swap the in-memory
 * store wholesale.
 *
 * The store is a small helper that matches the in-memory
 * `RoomStore.createRoom` + `getRoom` shape closely, so the
 * eventual swap is one factory call in `server-support.ts`.
 */

export interface RoomMetadataCreate {
  slug: RoomSlug;
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  createdAt: string;
}

export interface PgRoomMetadataRow extends RoomMetadataCreate {
  lastActivityAt: string;
  closedAt: string | null;
  status: "created" | "active" | "closed";
}

export interface PgRoomMetadataStore {
  put(input: RoomMetadataCreate): Promise<void>;
  get(slug: RoomSlug): Promise<PgRoomMetadataRow | null>;
  list(): Promise<PgRoomMetadataRow[]>;
}

export interface CreatePgRoomMetadataStoreInput {
  client: PgClient;
  tableName?: string;
}

export function toRoomMetadataCreate(input: RoomMetadataCreate): RoomMetadataCreate {
  return input;
}

function quoteIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return `"${name}"`;
}

export function createPgRoomMetadataStore(input: CreatePgRoomMetadataStoreInput): PgRoomMetadataStore {
  const client = input.client;
  const table = quoteIdentifier(input.tableName ?? "room_metadata");

  async function put(row: RoomMetadataCreate): Promise<void> {
    await client.query(
      `INSERT INTO ${table} (slug, access_mode, max_participants, quality_cap, allow_screen_share, created_at, last_activity_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'created')
       ON CONFLICT (slug)
       DO UPDATE SET
         access_mode = EXCLUDED.access_mode,
         max_participants = EXCLUDED.max_participants,
         quality_cap = EXCLUDED.quality_cap,
         allow_screen_share = EXCLUDED.allow_screen_share,
         created_at = EXCLUDED.created_at,
         last_activity_at = EXCLUDED.created_at,
         status = 'created'`,
      [
        row.slug,
        row.accessMode,
        row.maxParticipants,
        row.qualityCap,
        row.allowScreenShare,
        row.createdAt,
      ],
    );
  }

  async function get(slug: RoomSlug): Promise<PgRoomMetadataRow | null> {
    const result = await client.query<{
      slug: string;
      access_mode: AccessMode;
      max_participants: number;
      quality_cap: QualityCap;
      allow_screen_share: boolean;
      created_at: string;
      last_activity_at: string;
      closed_at: string | null;
      status: PgRoomMetadataRow["status"];
    }>(
      `SELECT slug, access_mode, max_participants, quality_cap, allow_screen_share, created_at, last_activity_at, closed_at, status
       FROM ${table}
       WHERE slug = $1`,
      [slug],
    );
    const row = result.rows[0];
    if (row == null) {
      return null;
    }
    return {
      slug: row.slug as RoomSlug,
      accessMode: row.access_mode,
      maxParticipants: row.max_participants,
      qualityCap: row.quality_cap,
      allowScreenShare: row.allow_screen_share,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      closedAt: row.closed_at,
      status: row.status,
    };
  }

  async function list(): Promise<PgRoomMetadataRow[]> {
    const result = await client.query<{
      slug: string;
      access_mode: AccessMode;
      max_participants: number;
      quality_cap: QualityCap;
      allow_screen_share: boolean;
      created_at: string;
      last_activity_at: string;
      closed_at: string | null;
      status: PgRoomMetadataRow["status"];
    }>(`SELECT slug, access_mode, max_participants, quality_cap, allow_screen_share, created_at, last_activity_at, closed_at, status FROM ${table}`);
    return result.rows.map((row) => ({
      slug: row.slug as RoomSlug,
      accessMode: row.access_mode,
      maxParticipants: row.max_participants,
      qualityCap: row.quality_cap,
      allowScreenShare: row.allow_screen_share,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      closedAt: row.closed_at,
      status: row.status,
    }));
  }

  return { put, get, list };
}
