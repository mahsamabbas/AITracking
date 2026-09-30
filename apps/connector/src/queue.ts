import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { ActivityEvent } from "@techlio/event-schema";

const ALGO = "aes-256-gcm";

export type PendingBatch = {
  rowIds: number[];
  events: ActivityEvent[];
};

type StoredRow = { id: number; payload: string; created_at: string };
type StoreFile = { nextId: number; rows: StoredRow[] };

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "techlio-connector", 32);
}

/**
 * Encrypted on-disk queue. Plain JSON so Windows/macOS installs do not compile
 * native addons (no Visual Studio / node-gyp).
 */
export class EncryptedQueue {
  private path: string;
  private key: Buffer;
  private legacyKeys: Buffer[];
  private rows: StoredRow[] = [];
  private nextId = 1;
  /** Rows that could not be decrypted with any known key (reported as a gap). */
  lostRows = 0;

  constructor(path: string, secret: string, legacySecrets: string[] = []) {
    this.path = path;
    this.key = deriveKey(secret);
    this.legacyKeys = legacySecrets.map(deriveKey);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as StoreFile;
      this.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      this.nextId = Number(parsed.nextId) || this.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    } catch {
      // Keep the unreadable file for inspection rather than overwriting it.
      try {
        renameSync(this.path, `${this.path}.corrupt-${Date.now()}`);
      } catch {
        /* nothing to preserve */
      }
      this.rows = [];
      this.nextId = 1;
      this.lostRows += 1;
    }
  }

  private save(): void {
    const body: StoreFile = { nextId: this.nextId, rows: this.rows };
    // Atomic replace: a crash mid-write never leaves a truncated queue file.
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    renameSync(tmp, this.path);
  }

  private encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  private decryptWith(key: Buffer, encoded: string): string {
    const buf = Buffer.from(encoded, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  private decrypt(encoded: string): string {
    for (const key of [this.key, ...this.legacyKeys]) {
      try {
        return this.decryptWith(key, encoded);
      } catch {
        /* try the next key */
      }
    }
    throw new Error("undecryptable_row");
  }

  enqueue(events: ActivityEvent[]): void {
    this.rows.push({
      id: this.nextId++,
      payload: this.encrypt(JSON.stringify(events)),
      created_at: new Date().toISOString(),
    });
    this.save();
  }

  peekBatch(limit = 100): PendingBatch {
    const slice = this.rows.slice(0, limit);
    const events: ActivityEvent[] = [];
    const rowIds: number[] = [];
    const drop = new Set<number>();
    for (const row of slice) {
      try {
        const parsed = JSON.parse(this.decrypt(row.payload)) as ActivityEvent[];
        events.push(...parsed);
        rowIds.push(row.id);
      } catch {
        drop.add(row.id);
      }
    }
    if (drop.size) {
      this.lostRows += drop.size;
      this.rows = this.rows.filter((row) => !drop.has(row.id));
      this.save();
    }
    return { rowIds, events };
  }

  acknowledge(rowIds: number[]): void {
    if (rowIds.length === 0) return;
    const gone = new Set(rowIds);
    this.rows = this.rows.filter((row) => !gone.has(row.id));
    this.save();
  }

  depth(): number {
    return this.rows.length;
  }

  clear(): void {
    this.rows = [];
    this.save();
  }
}
