// Crypto utilities — PIN verification and note encryption.
// Uses Node.js built-in crypto (no external deps) plus Argon2id for key derivation.
// PIN is never stored; only a salted SHA-256 verifier is persisted.
// Note encryption uses AES-256-GCM with a key derived from PIN + per-user salt via Argon2id.

import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";

// ── PIN verifier (fast pre-check before expensive key derivation) ──

export interface PinVerifier {
  /** Base64-encoded SHA-256 hash of "salt + pin". */
  hash: string;
  /** Base64-encoded random salt. */
  salt: string;
}

/**
 * Create a verifier from a plaintext PIN. The PIN is hashed with a
 * random salt via SHA-256 and the result is stored — never the PIN itself.
 */
export function createPinVerifier(pin: string): PinVerifier {
  const salt = randomBytes(16);
  const hash = createHash("sha256")
    .update(Buffer.concat([salt, Buffer.from(pin, "utf-8")]))
    .digest();
  return { hash: hash.toString("base64"), salt: salt.toString("base64") };
}

/**
 * Verify a plaintext PIN against a stored verifier.
 */
export function verifyPin(pin: string, verifier: PinVerifier): boolean {
  const salt = Buffer.from(verifier.salt, "base64");
  const hash = createHash("sha256")
    .update(Buffer.concat([salt, Buffer.from(pin, "utf-8")]))
    .digest();
  return hash.toString("base64") === verifier.hash;
}

// ── Key derivation (Argon2id with PBKDF2 fallback) ────────────────

/**
 * Generate a 16-byte random salt for encryption key derivation.
 */
export function createKeySalt(): Buffer {
  return randomBytes(16);
}

/**
 * Derive a 32-byte AES-256 key from a PIN + per-user salt using Argon2id.
 *
 * Parameters (Argon2id): time=2, memory=64 MiB, parallelism=1.
 * Falls back to PBKDF2-HMAC-SHA256 (200,000 iterations) if Argon2 is unavailable.
 *
 * Never store the returned key beyond the single operation it is used for.
 */
export async function deriveEncryptionKey(pin: string, keySalt: Buffer): Promise<Buffer> {
  try {
    const argon2 = (await import("argon2")).default;
    return await argon2.hash(pin, {
      type: argon2.argon2id,
      timeCost: 2,
      memoryCost: 65536, // 64 MiB
      parallelism: 1,
      salt: keySalt,
      raw: true,
      hashLength: 32,
    }) as Buffer;
  } catch {
    // Argon2 unavailable — fallback to PBKDF2-HMAC-SHA256 with 200,000 iterations
    return pbkdf2Sync(pin, keySalt, 200_000, 32, "sha256");
  }
}

// ── Note encryption / decryption (AES-256-GCM) ────────────────────

export interface EncryptedPayload {
  /** Base64-encoded ciphertext (includes GCM auth tag appended). */
  data: string;
  /** Base64-encoded random IV used for this encryption. */
  iv: string;
}

/**
 * Encrypt plaintext with AES-256-GCM. Uses the pre-derived key (32 bytes).
 * Returns the encrypted payload containing the ciphertext (with appended auth tag)
 * and the IV. The per-user key salt is NOT stored per-note — it lives on the UserMetadata record.
 */
export function encryptNote(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    data: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

/**
 * Decrypt an encrypted payload back to plaintext. Returns null on
 * wrong PIN or tampered data (auth tag mismatch → GCM throws).
 */
export function decryptNote(payload: EncryptedPayload, key: Buffer): string | null {
  try {
    const iv = Buffer.from(payload.iv, "base64");
    const raw = Buffer.from(payload.data, "base64");
    // Last 16 bytes are the GCM auth tag
    const tag = raw.subarray(-16);
    const ciphertext = raw.subarray(0, -16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    // Wrong PIN or corrupted data
    return null;
  }
}