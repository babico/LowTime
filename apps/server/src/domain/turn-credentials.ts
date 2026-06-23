import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived TURN credentials (Issue #34 slice 1).
 *
 * The coturn REST API expects a username of the form
 * `<timestamp>:<user>` and a base64-encoded HMAC-SHA1 of
 * `<username>:<turn-secret>` as the credential. The timestamp
 * is the unix epoch in seconds when the credential stops
 * working. The default TTL is 24 hours.
 *
 * The verify helper recomputes the expected credential and
 * uses `timingSafeEqual` so an attacker cannot time-attack the
 * comparison.
 */

const DEFAULT_TTL_SEC = 24 * 60 * 60;

export interface GenerateTurnCredentialsInput {
  secret: string;
  userId?: string;
  ttlSec?: number;
  now?: () => number;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

function clipTtl(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_TTL_SEC;
}

function randomUserId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function generateTurnCredentials(input: GenerateTurnCredentialsInput): TurnCredentials {
  const ttl = clipTtl(input.ttlSec);
  const userId = input.userId ?? randomUserId();
  const nowSec = Math.floor((input.now ?? (() => Date.now()))() / 1000);
  const expiresAt = nowSec + ttl;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac("sha1", input.secret)
    .update(`${username}:${input.secret}`)
    .digest("base64");

  return { username, credential, ttl };
}

export interface VerifyTurnCredentialsInput {
  secret: string;
  username: string;
  credential: string;
  now?: () => number;
}

export function verifyTurnCredentials(input: VerifyTurnCredentialsInput): boolean {
  const nowSec = Math.floor((input.now ?? (() => Date.now()))() / 1000);
  const parts = input.username.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const ts = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(ts) || ts <= nowSec) {
    return false;
  }
  const expected = createHmac("sha1", input.secret)
    .update(`${input.username}:${input.secret}`)
    .digest("base64");

  if (expected.length !== input.credential.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.credential));
  } catch {
    return false;
  }
}
