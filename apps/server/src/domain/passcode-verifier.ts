import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * Argon2id-backed passcode hashing and verification. Used by the server to
 * store only the encoded hash of a room's passcode (Requirement 2.1) and to
 * check submitted passcodes on join without leaking timing information
 * (Requirement 4.3).
 *
 * The interface exists so tests can substitute a deterministic fake.
 */
export interface PasscodeVerifier {
  /** Produce an Argon2id encoded hash of `plaintext`. Each call uses a new salt. */
  hash(plaintext: string): Promise<string>;
  /**
   * Constant-time verify of `plaintext` against a previously produced encoded
   * hash. Returns `true` on match, `false` on mismatch.
   */
  verify(encodedHash: string, plaintext: string): Promise<boolean>;
}

export interface CreatePasscodeVerifierOptions {
  /** Memory cost in KiB. Defaults to OWASP 2024 baseline of 19 MiB. */
  memoryCost?: number;
  /** Iteration count. Defaults to OWASP 2024 baseline of 2. */
  timeCost?: number;
  /** Parallelism degree. Defaults to 1. */
  parallelism?: number;
}

// OWASP 2024 baseline tuning for Argon2id with a short secret input.
// See docs/09-security-and-abuse.md for the rationale.
const DEFAULT_MEMORY_COST = 19 * 1024; // 19 MiB
const DEFAULT_TIME_COST = 2;
const DEFAULT_PARALLELISM = 1;

export function createArgon2idPasscodeVerifier(
  options: CreatePasscodeVerifierOptions = {},
): PasscodeVerifier {
  const memoryCost = options.memoryCost ?? DEFAULT_MEMORY_COST;
  const timeCost = options.timeCost ?? DEFAULT_TIME_COST;
  const parallelism = options.parallelism ?? DEFAULT_PARALLELISM;

  return {
    async hash(plaintext: string): Promise<string> {
      return argon2Hash(plaintext, {
        algorithm: Algorithm.Argon2id,
        memoryCost,
        timeCost,
        parallelism,
      });
    },
    async verify(encodedHash: string, plaintext: string): Promise<boolean> {
      // `@node-rs/argon2`'s verify reads the embedded parameters and does a
      // constant-time comparison on the derived digest, so mismatches do not
      // short-circuit earlier than matches.
      return argon2Verify(encodedHash, plaintext);
    },
  };
}
