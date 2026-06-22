/**
 * Bounded per-room chat history (Issue #33 slice 5).
 *
 * Pure interface so the in-memory implementation stays the dev
 * default and the Redis-backed implementation can be wired in
 * production. The signal bus already broadcasts new messages;
 * this module adds the bounded history the chat panel can
 * rehydrate after a refresh.
 */

export interface ChatEntry {
  id: string;
  roomSlug: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string;
}

export interface ChatBuffer {
  append(roomSlug: string, entry: ChatEntry): Promise<void>;
  list(roomSlug: string): Promise<ChatEntry[]>;
}

export interface ChatBufferOptions {
  capacity?: number;
}

const DEFAULT_CAPACITY = 100;

function clipCapacity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_CAPACITY;
}

export function createInMemoryChatBuffer(options: ChatBufferOptions = {}): ChatBuffer {
  const capacity = clipCapacity(options.capacity);
  const buffers = new Map<string, ChatEntry[]>();

  return {
    async append(roomSlug, entry) {
      const list = buffers.get(roomSlug) ?? [];
      list.push(entry);
      if (list.length > capacity) {
        list.splice(0, list.length - capacity);
      }
      buffers.set(roomSlug, list);
    },
    async list(roomSlug) {
      return [...(buffers.get(roomSlug) ?? [])];
    },
  };
}

export interface RedisLike {
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export interface RedisChatBufferOptions extends ChatBufferOptions {
  redis: RedisLike;
  keyPrefix: string;
}

function keyFor(prefix: string, roomSlug: string): string {
  return `${prefix}:chat:${roomSlug}`;
}

export function createRedisChatBuffer(options: RedisChatBufferOptions): ChatBuffer {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const capacity = clipCapacity(options.capacity);

  return {
    async append(roomSlug, entry) {
      const k = keyFor(prefix, roomSlug);
      await redis.lpush(k, JSON.stringify(entry));
      await redis.ltrim(k, 0, capacity - 1);
    },
    async list(roomSlug) {
      const raws = await redis.lrange(keyFor(prefix, roomSlug), 0, capacity - 1);
      const items = raws
        .map((raw) => {
          try {
            return JSON.parse(raw) as ChatEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is ChatEntry => entry != null);
      return items.reverse();
    },
  };
}
