// Crypto utilities — PIN verification and note encryption.
// Uses Node.js built-in crypto (no external deps).
// PIN is never stored; only a salted SHA-256 verifier is persisted.
// Note encryption uses AES-256-GCM with a key derived from PIN+note-specific salt.

import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";

// ── PIN verifier ─────────────────────────────────────────────

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

// ── Note encryption ──────────────────────────────────────────

export interface EncryptedPayload {
  /** Base64-encoded ciphertext (includes GCM auth tag appended). */
  data: string;
  /** Base64-encoded random IV used for this encryption. */
  iv: string;
  /** Base64-encoded random salt used for key derivation. */
  salt: string;
}

const KEY_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // AES-256
const DIGEST = "sha256";

/**
 * Derive an AES-256 key from PIN + a per-encryption salt using PBKDF2.
 */
function deriveKey(pin: string, salt: Buffer): Buffer {
  return pbkdf2Sync(pin, salt, KEY_ITERATIONS, KEY_LENGTH, DIGEST);
}

/**
 * Encrypt plaintext with AES-256-GCM. Returns the encrypted payload
 * containing the ciphertext (with appended auth tag), IV, and salt.
 */
export function encryptNote(plaintext: string, pin: string): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12); // 96-bit IV for GCM
  const key = deriveKey(pin, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  // Append auth tag after ciphertext
  const tag = cipher.getAuthTag();
  return {
    data: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Decrypt an encrypted payload back to plaintext. Returns null on
 * wrong PIN or tampered data (auth tag mismatch → GCM throws).
 */
export function decryptNote(payload: EncryptedPayload, pin: string): string | null {
  try {
    const salt = Buffer.from(payload.salt, "base64");
    const iv = Buffer.from(payload.iv, "base64");
    const key = deriveKey(pin, salt);
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