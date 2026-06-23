import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import RedisMock from "ioredis-mock";

import {
  createInMemoryChatBuffer,
  createRedisChatBuffer,
  type ChatBuffer,
  type ChatEntry,
  type RedisLike,
} from "./domain/chat-buffer.js";

function entry(text: string, offsetMs: number, senderId = "sess_1"): ChatEntry {
  return {
    id: `m_${offsetMs}_${text}`,
    roomSlug: "alpha",
    senderId,
    senderName: "Alice",
    body: text,
    sentAt: new Date(Date.UTC(2026, 5, 22, 12, 0, 0, offsetMs)).toISOString(),
  };
}

describe("createInMemoryChatBuffer", () => {
  test("append then list returns the messages in order", async () => {
    const buffer = createInMemoryChatBuffer();
    await buffer.append("alpha", entry("hi", 0));
    await buffer.append("alpha", entry("there", 1));
    const messages = await buffer.list("alpha");
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.body, "hi");
    assert.equal(messages[1]?.body, "there");
  });

  test("the buffer is bounded by the cap and drops the oldest first", async () => {
    const buffer = createInMemoryChatBuffer({ capacity: 2 });
    await buffer.append("alpha", entry("first", 0));
    await buffer.append("alpha", entry("second", 1));
    await buffer.append("alpha", entry("third", 2));
    const messages = await buffer.list("alpha");
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.body, "second");
    assert.equal(messages[1]?.body, "third");
  });

  test("list returns only messages for the given room", async () => {
    const buffer = createInMemoryChatBuffer();
    await buffer.append("alpha", entry("a", 0));
    await buffer.append("beta", entry("b", 1));
    assert.equal((await buffer.list("alpha")).length, 1);
    assert.equal((await buffer.list("beta")).length, 1);
  });
});

describe("createRedisChatBuffer", () => {
  function makeRedis(): RedisLike {
    return new RedisMock() as unknown as RedisLike;
  }

  function newBuffer(suffix: string, capacity?: number): ChatBuffer {
    return createRedisChatBuffer({
      redis: makeRedis(),
      keyPrefix: `lowtime-test-chat-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      capacity,
    });
  }

  test("append then list returns the messages in order", async () => {
    const buffer = newBuffer("order");
    await buffer.append("alpha", entry("hi", 0));
    await buffer.append("alpha", entry("there", 1));
    const messages = await buffer.list("alpha");
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.body, "hi");
    assert.equal(messages[1]?.body, "there");
  });

  test("the buffer is bounded by the cap and drops the oldest first", async () => {
    const buffer = newBuffer("cap", 2);
    await buffer.append("alpha", entry("first", 0));
    await buffer.append("alpha", entry("second", 1));
    await buffer.append("alpha", entry("third", 2));
    const messages = await buffer.list("alpha");
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.body, "second");
    assert.equal(messages[1]?.body, "third");
  });

  test("list returns only messages for the given room", async () => {
    const buffer = newBuffer("rooms");
    await buffer.append("alpha", entry("a", 0));
    await buffer.append("beta", entry("b", 1));
    assert.equal((await buffer.list("alpha")).length, 1);
    assert.equal((await buffer.list("beta")).length, 1);
  });
});
