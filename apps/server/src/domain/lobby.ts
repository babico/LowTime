/**
 * Lobby decision state (Issue #33 slice 3).
 *
 * Pure interface so the in-memory implementation stays the dev
 * default and the Redis-backed implementation can be wired in
 * production. The room store still owns the per-room
 * `lobbyRequests` map; this module adds a thin decision log
 * that the metrics module can read to emit
 * `lobby_decision{decision=...}` counters.
 */

export type LobbyDecision = "approve" | "deny";

export interface LobbyEnqueueInput {
  roomSlug: string;
  displayName: string;
  now: Date;
}

export interface LobbyRequest {
  id: string;
  roomSlug: string;
  displayName: string;
  enqueuedAt: string;
}

export interface LobbyDecisionRecord {
  requestId: string;
  roomSlug: string;
  decision: LobbyDecision;
  decidedAt: string;
}

export interface Lobby {
  enqueue(input: LobbyEnqueueInput): Promise<string>;
  decide(roomSlug: string, requestId: string, decision: LobbyDecision, now: Date): Promise<{ ok: boolean }>;
  list(roomSlug: string): Promise<LobbyRequest[]>;
  recentDecisions(roomSlug: string): Promise<LobbyDecisionRecord[]>;
}

export interface LobbyOptions {
  recentDecisionsCap?: number;
  now?: () => number;
}

const DEFAULT_CAP = 50;

function clipCap(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_CAP;
}

function makeRequestId(): string {
  return `lreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInMemoryLobby(options: LobbyOptions = {}): Lobby {
  const cap = clipCap(options.recentDecisionsCap);
  const now = options.now ?? (() => Date.now());

  const queues = new Map<string, LobbyRequest[]>();
  const decisions = new Map<string, LobbyDecisionRecord[]>();

  function trimDecisions(roomSlug: string): void {
    const list = decisions.get(roomSlug);
    if (list != null && list.length > cap) {
      decisions.set(roomSlug, list.slice(-cap));
    }
  }

  return {
    async enqueue({ roomSlug, displayName, now: at }) {
      const request: LobbyRequest = {
        id: makeRequestId(),
        roomSlug,
        displayName,
        enqueuedAt: new Date(at.getTime() || now()).toISOString(),
      };
      const list = queues.get(roomSlug) ?? [];
      list.push(request);
      queues.set(roomSlug, list);
      return request.id;
    },
    async decide(roomSlug, requestId, decision, at) {
      const list = queues.get(roomSlug);
      const idx = list?.findIndex((entry) => entry.id === requestId) ?? -1;
      if (list == null || idx === -1) {
        return { ok: false };
      }
      list.splice(idx, 1);
      if (list.length === 0) {
        queues.delete(roomSlug);
      }
      const decList = decisions.get(roomSlug) ?? [];
      decList.push({
        requestId,
        roomSlug,
        decision,
        decidedAt: new Date(at.getTime() || now()).toISOString(),
      });
      decisions.set(roomSlug, decList);
      trimDecisions(roomSlug);
      return { ok: true };
    },
    async list(roomSlug) {
      return [...(queues.get(roomSlug) ?? [])];
    },
    async recentDecisions(roomSlug) {
      return [...(decisions.get(roomSlug) ?? [])];
    },
  };
}

export interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  set(key: string, value: string, mode: string, duration: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export interface RedisLobbyOptions extends LobbyOptions {
  redis: RedisLike;
  keyPrefix: string;
}

function queueKey(prefix: string, roomSlug: string): string {
  return `${prefix}:q:${roomSlug}`;
}

function decisionsKey(prefix: string, roomSlug: string): string {
  return `${prefix}:d:${roomSlug}`;
}

function encodeRequest(request: LobbyRequest): string {
  return JSON.stringify(request);
}

function decodeRequest(raw: string): LobbyRequest | null {
  try {
    const value = JSON.parse(raw) as LobbyRequest;
    if (
      typeof value === "object" &&
      value != null &&
      typeof value.id === "string" &&
      typeof value.roomSlug === "string" &&
      typeof value.displayName === "string" &&
      typeof value.enqueuedAt === "string"
    ) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

function encodeDecision(record: LobbyDecisionRecord): string {
  return JSON.stringify(record);
}

function decodeDecision(raw: string): LobbyDecisionRecord | null {
  try {
    const value = JSON.parse(raw) as LobbyDecisionRecord;
    if (
      typeof value === "object" &&
      value != null &&
      typeof value.requestId === "string" &&
      typeof value.roomSlug === "string" &&
      (value.decision === "approve" || value.decision === "deny") &&
      typeof value.decidedAt === "string"
    ) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function createRedisLobby(options: RedisLobbyOptions): Lobby {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const cap = clipCap(options.recentDecisionsCap);
  const now = options.now ?? (() => Date.now());

  return {
    async enqueue({ roomSlug, displayName, now: at }) {
      const request: LobbyRequest = {
        id: makeRequestId(),
        roomSlug,
        displayName,
        enqueuedAt: new Date(at.getTime() || now()).toISOString(),
      };
      await redis.lpush(queueKey(prefix, roomSlug), encodeRequest(request));
      return request.id;
    },
    async decide(roomSlug, requestId, decision, at) {
      const raws = await redis.lrange(queueKey(prefix, roomSlug), 0, -1);
      const items = raws.map(decodeRequest).filter((r): r is LobbyRequest => r != null);
      const match = items.find((entry) => entry.id === requestId);
      if (match == null) {
        return { ok: false };
      }

      // Remove the matched entry by rewriting the queue. We avoid
      // lrem because ioredis-mock's `count=0` (remove all) and `count>1`
      // semantics differ slightly from real Redis; this rewrite is
      // trivially correct on both.
      const remaining = items.filter((entry) => entry.id !== requestId).map(encodeRequest);
      const qKey = queueKey(prefix, roomSlug);
      await redis.del(qKey);
      if (remaining.length > 0) {
        await redis.lpush(qKey, ...remaining);
      }

      const record: LobbyDecisionRecord = {
        requestId,
        roomSlug,
        decision,
        decidedAt: new Date(at.getTime() || now()).toISOString(),
      };
      await redis.lpush(decisionsKey(prefix, roomSlug), encodeDecision(record));
      await redis.ltrim(decisionsKey(prefix, roomSlug), 0, cap - 1);
      return { ok: true };
    },
    async list(roomSlug) {
      const raws = await redis.lrange(queueKey(prefix, roomSlug), 0, -1);
      return raws.map(decodeRequest).filter((r): r is LobbyRequest => r != null);
    },
    async recentDecisions(roomSlug) {
      const raws = await redis.lrange(decisionsKey(prefix, roomSlug), 0, cap - 1);
      return raws.map(decodeDecision).filter((r): r is LobbyDecisionRecord => r != null);
    },
  };
}
