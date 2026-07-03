// Persistent domain store — the ONLY way durable data is read/written.
// Uses an in-memory Map by default (for dev/test); for production, swap
// to a Redis-backed adapter via the same resolve-session-storage pattern.
//
// INDEX discipline (never KEYS/SCAN):
//   user:{id}           → UserMetadata
//   cred:{id}           → PinVerifier (JSON)
//   note:{id}           → NoteRecord (JSON)
//   noteIds:{userId}    → string[] (sorted note IDs for this user)
//   nextNoteId:{userId} → number (auto-increment counter per user)

import type { PinVerifier } from "./crypto.js";
import { clock } from "./clock.js";

// ── Types ────────────────────────────────────────────────────

export interface UserMetadata {
  /** Telegram user ID. */
  id: number;
  /** ISO-8601 registration timestamp. */
  registeredAt: string;
  /** ISO-8601 last activity timestamp. */
  lastActivityAt: string;
  /** Base64-encoded per-user random salt used for encryption key derivation. */
  keySalt: string;
}

export interface NoteRecord {
  id: string;
  userId: number;
  title: string;
  encrypted: { data: string; iv: string };
  createdAt: string;
  updatedAt: string;
}

// ── KV store interface (swap in Redis for production) ────────

export interface KvStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

/** In-memory KV store — the default. Fresh per bot instance. */
export class MemoryKvStore implements KvStore {
  private readonly store = new Map<string, string>();

  get<T>(key: string): T | undefined {
    const raw = this.store.get(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value));
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

// ── Domain store (index-based access) ────────────────────────

const K = {
  user: (id: number) => `user:${id}`,
  cred: (id: number) => `cred:${id}`,
  note: (id: string) => `note:${id}`,
  noteIds: (userId: number) => `noteIds:${userId}`,
  nextNoteId: (userId: number) => `nextNoteId:${userId}`,
};

export class DomainStore {
  constructor(private readonly kv: KvStore) {}

  // ── Users ──

  getUser(userId: number): UserMetadata | undefined {
    return this.kv.get<UserMetadata>(K.user(userId));
  }

  upsertUser(userId: number, keySalt?: string): UserMetadata {
    const now = clock.now().toISOString();
    const existing = this.getUser(userId);
    const record: UserMetadata = existing ?? { id: userId, registeredAt: now, lastActivityAt: now, keySalt: keySalt ?? "" };
    record.lastActivityAt = now;
    if (keySalt !== undefined) record.keySalt = keySalt;
    this.kv.set(K.user(userId), record);
    return record;
  }

  // ── Credentials (PIN verifier) ──

  getCredential(userId: number): PinVerifier | undefined {
    return this.kv.get<PinVerifier>(K.cred(userId));
  }

  setCredential(userId: number, verifier: PinVerifier): void {
    this.kv.set(K.cred(userId), verifier);
  }

  hasCredential(userId: number): boolean {
    return this.getCredential(userId) !== undefined;
  }

  // ── Notes ──

  /**
   * Create a new note for a user. Returns the generated note ID.
   */
  createNote(userId: number, title: string, encrypted: NoteRecord["encrypted"]): NoteRecord {
    const next = (this.kv.get<number>(K.nextNoteId(userId)) ?? 0) + 1;
    this.kv.set(K.nextNoteId(userId), next);
    const id = `${next}`;
    const now = clock.now().toISOString();
    const note: NoteRecord = { id, userId, title, encrypted, createdAt: now, updatedAt: now };
    this.kv.set(K.note(id), note);

    // Append to user's note index
    const ids = this.kv.get<string[]>(K.noteIds(userId)) ?? [];
    ids.push(id);
    this.kv.set(K.noteIds(userId), ids);

    return note;
  }

  /** Get a note by its numeric ID (string form). */
  getNote(id: string): NoteRecord | undefined {
    return this.kv.get<NoteRecord>(K.note(id));
  }

  /** List note IDs for a user (sorted by creation, newest first). */
  listNoteIds(userId: number): string[] {
    const ids = this.kv.get<string[]>(K.noteIds(userId)) ?? [];
    // Reverse so newest first
    return ids.slice().reverse();
  }

  /** Count notes for a user. */
  noteCount(userId: number): number {
    return (this.kv.get<string[]>(K.noteIds(userId)) ?? []).length;
  }

  /** Delete a note. Silently no-ops if it doesn't belong to the user. */
  deleteNote(noteId: string, userId: number): boolean {
    const note = this.getNote(noteId);
    if (!note || note.userId !== userId) return false;

    this.kv.delete(K.note(noteId));

    // Remove from user's index
    const ids = this.kv.get<string[]>(K.noteIds(userId)) ?? [];
    const filtered = ids.filter((id) => id !== noteId);
    this.kv.set(K.noteIds(userId), filtered);

    return true;
  }
}

// ── Singleton ─────────────────────────────────────────────────

let _store: DomainStore | null = null;
let _kv: KvStore | null = null;

/**
 * Get the domain store singleton. Created on first call with a fresh
 * MemoryKvStore (in-memory). For production, call `initDomainStore(redisAdapter)`.
 * In tests, call `resetDomainStore()` between specs for isolation.
 */
export function getDomainStore(): DomainStore {
  if (!_store) {
    _kv = new MemoryKvStore();
    _store = new DomainStore(_kv);
  }
  return _store;
}

/** Replace the store's backing KV store (e.g. with Redis adapter). */
export function initDomainStore(kv: KvStore): DomainStore {
  _kv = kv;
  _store = new DomainStore(kv);
  return _store;
}

/** Reset for test isolation — clears all data. */
export function resetDomainStore(): void {
  _kv = new MemoryKvStore();
  _store = new DomainStore(_kv);
}