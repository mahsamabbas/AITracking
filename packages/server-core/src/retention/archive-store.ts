import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Where archived events live. Private object storage; the database keeps only
 * a manifest (retention_days) of what was written where.
 *
 *   ARCHIVE_STORAGE=supabase  SUPABASE_URL + SUPABASE_SECRET_KEY (or
 *                             SUPABASE_SERVICE_ROLE_KEY), bucket ARCHIVE_BUCKET
 *                             (default "activity-archive", created private)
 *   ARCHIVE_STORAGE=local     ARCHIVE_DIR (development)
 *
 * With no store configured, nothing is ever purged: events stay in the
 * database until an archive exists.
 */
export interface ArchiveStore {
  readonly name: string;
  put(path: string, body: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
}

function supabaseStore(): ArchiveStore | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const bucket = process.env.ARCHIVE_BUCKET ?? "activity-archive";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let bucketReady: Promise<void> | null = null;

  const ensureBucket = () =>
    (bucketReady ??= (async () => {
      const r = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
      if (r.ok) return;
      const created = await fetch(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ id: bucket, name: bucket, public: false }),
      });
      // 409/400 "already exists" from a concurrent run is fine.
      if (!created.ok && created.status !== 409 && created.status !== 400) {
        bucketReady = null;
        throw new Error(`archive bucket: ${created.status} ${await created.text()}`);
      }
    })());

  const objectUrl = (path: string) => `${url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

  return {
    name: `supabase:${bucket}`,
    async put(path, body, contentType) {
      await ensureBucket();
      const r = await fetch(objectUrl(path), {
        method: "POST",
        headers: { ...headers, "content-type": contentType, "x-upsert": "true" },
        body: new Uint8Array(body),
      });
      if (!r.ok) throw new Error(`archive upload ${path}: ${r.status} ${await r.text()}`);
    },
    async get(path) {
      const r = await fetch(objectUrl(path), { headers });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`archive download ${path}: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

function localStore(): ArchiveStore | null {
  const dir = process.env.ARCHIVE_DIR;
  if (!dir) return null;
  const root = resolve(dir);
  const safe = (path: string) => {
    const full = resolve(join(root, path));
    if (!full.startsWith(root)) throw new Error("archive path escapes ARCHIVE_DIR");
    return full;
  };
  return {
    name: `local:${root}`,
    async put(path, body) {
      const full = safe(path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, body);
    },
    async get(path) {
      try {
        return await readFile(safe(path));
      } catch {
        return null;
      }
    },
  };
}

let cached: ArchiveStore | null | undefined;

/** The configured store, or null when archiving is not set up. */
export function archiveStore(): ArchiveStore | null {
  if (cached !== undefined) return cached;
  const kind = (process.env.ARCHIVE_STORAGE ?? (process.env.SUPABASE_URL ? "supabase" : process.env.ARCHIVE_DIR ? "local" : "")).toLowerCase();
  cached = kind === "supabase" ? supabaseStore() : kind === "local" ? localStore() : null;
  return cached;
}
