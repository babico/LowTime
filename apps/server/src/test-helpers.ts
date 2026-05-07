import { Writable } from "node:stream";

import type { LiveKitConfig } from "./livekit.js";

export const TEST_LIVEKIT_CONFIG: LiveKitConfig = {
  url: "ws://localhost:7880",
  apiKey: "devkey",
  apiSecret: "secret",
};

export interface MemoryLogger {
  /**
   * The value to pass to Fastify's `logger` option so captured logs flow into
   * this helper. Fastify and Pino both accept a `{ stream }` option to route
   * output into a custom writable stream.
   */
  loggerOption: { stream: Writable };
  /**
   * Returns the raw log content captured so far, joined by newline separators
   * that Pino inserts between records. Used by Property 5 to scan for accidental
   * passcode leaks.
   */
  readCapturedLogs: () => string;
}

/**
 * Creates a Fastify-compatible logger option backed by an in-memory buffer.
 * Tests that need to assert about log output capture it without touching real
 * stdout, which keeps the default `node --test` reporter output readable.
 */
export function createMemoryLogger(): MemoryLogger {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });

  return {
    loggerOption: { stream },
    readCapturedLogs: () => chunks.join(""),
  };
}

/**
 * Concatenates response bodies and captured log lines into a single string so
 * substring scans can check that a sensitive value never appears in any
 * observable output. Used by Property 5 (no echo).
 */
export function joinOutputs(bodies: readonly string[], logs: string): string {
  return `${bodies.join("\n")}\n${logs}`;
}
