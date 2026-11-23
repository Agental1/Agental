import { gzipSync } from "node:zlib";

/**
 * Daily database backup (round 8c). The Supabase Free plan keeps no backup we
 * can download, so once a day a Vercel cron calls /api/cron/backup, which:
 *
 * 1. reads every table of the "public" and "limelight" schemas as JSON, in one
 *    READ ONLY, REPEATABLE READ transaction (one consistent snapshot), except
 *    the GeoNames tables (reloaded by their migration) and RateLimitEvent
 *    (short-lived counters);
 * 2. gzips it and stores it in the private Storage bucket "backups" as
 *    daily/YYYY-MM-DD.json.gz (no policy: only the service key reads it);
 * 3. removes the files older than KEEP_DAYS.
 *
 * Restoring: tools/db/restore-backup.mjs and docs/BACKUPS.md.
 */

export const BACKUP_BUCKET = "backups";
export const KEEP_DAYS = 14;
/**
 * Left out: rebuilt by their migration (GeoNames), short-lived (RateLimitEvent),
 * or live credentials that a backup must not carry (sign-in sessions and
 * one-time email tokens; people simply sign in again after a restore).
 */
export const SKIPPED_TABLES = new Set([
  "public.GeoCountry",
  "public.GeoAdmin1",
  "public.GeoCity",
  "public.RateLimitEvent",
  "public.Session",
  "public.VerificationToken",
]);

export interface BackupDb {
  $transaction<T>(fn: (tx: BackupTx) => Promise<T>, opts?: { isolationLevel?: "RepeatableRead"; timeout?: number }): Promise<T>;
}
export interface BackupTx {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

export interface BackupFile {
  version: 1;
  createdAt: string;
  /** The last migration applied: restore into a database migrated to at least this one. */
  lastMigration: string | null;
  tables: Record<string, unknown[]>;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function exportDatabase(db: BackupDb, now: Date = new Date()): Promise<BackupFile> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const tables = await tx.$queryRawUnsafe<{ schema: string; name: string }[]>(`
        select n.nspname as schema, c.relname as name
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r', 'p') and n.nspname in ('public', 'limelight')
           and c.relname <> '_prisma_migrations'
         order by 1, 2`);
      const out: Record<string, unknown[]> = {};
      for (const t of tables) {
        const key = `${t.schema}.${t.name}`;
        if (SKIPPED_TABLES.has(key)) continue;
        const rows = await tx.$queryRawUnsafe<{ data: unknown[] | null }[]>(
          `select json_agg(t) as data from ${ident(t.schema)}.${ident(t.name)} t`
        );
        out[key] = rows[0]?.data ?? [];
      }
      const last = await tx
        .$queryRawUnsafe<{ name: string }[]>(
          `select migration_name as name from public."_prisma_migrations"
            where finished_at is not null and rolled_back_at is null
            order by migration_name desc limit 1`
        )
        .catch(() => []);
      return { version: 1 as const, createdAt: now.toISOString(), lastMigration: last[0]?.name ?? null, tables: out };
    },
    { isolationLevel: "RepeatableRead", timeout: 50_000 }
  );
}

export function backupPath(now: Date): string {
  return `daily/${now.toISOString().slice(0, 10)}.json.gz`;
}

/** The daily files older than KEEP_DAYS, by name (daily/YYYY-MM-DD.json.gz). */
export function expiredBackups(names: string[], now: Date, keepDays = KEEP_DAYS): string[] {
  const cutoff = new Date(now.getTime() - keepDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return names.filter((n) => {
    const m = /^(?:daily\/)?(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(n);
    return m !== null && m[1] < cutoff;
  });
}

export type StorageEnv = Record<string, string | undefined>;

/** Store the backup and prune old ones. Throws on a Storage refusal (the cron logs it). */
export async function storeBackup(
  file: BackupFile,
  now: Date,
  env: StorageEnv = process.env,
  send: typeof fetch = fetch
): Promise<{ path: string; bytes: number; removed: number }> {
  const base = (env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!base || !key) throw new Error("storage_not_configured");
  const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key}`, apikey: key, ...extra });
  const api = (p: string) => `${base}/storage/v1${p}`;

  // The bucket, private, once (an existing bucket answers 400 or 409).
  const made = await send(api("/bucket"), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BACKUP_BUCKET, name: BACKUP_BUCKET, public: false }),
  });
  if (!made.ok && made.status !== 400 && made.status !== 409) throw new Error(`bucket_${made.status}`);
  if (!made.ok) {
    // The bucket existed: make sure nobody turned it public by hand.
    const info = await send(api(`/bucket/${BACKUP_BUCKET}`), { headers: headers() });
    const bucket = info.ok ? ((await info.json()) as { public?: boolean }) : null;
    if (!bucket) throw new Error(`bucket_check_${info.status}`);
    if (bucket.public !== false) {
      const fix = await send(api(`/bucket/${BACKUP_BUCKET}`), {
        method: "PUT",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ public: false }),
      });
      if (!fix.ok) throw new Error("bucket_public");
    }
  }

  const body = gzipSync(Buffer.from(JSON.stringify(file)));
  const path = backupPath(now);
  const put = await send(api(`/object/${BACKUP_BUCKET}/${path}`), {
    method: "POST",
    headers: headers({ "Content-Type": "application/gzip", "x-upsert": "true" }),
    body: new Uint8Array(body),
  });
  if (!put.ok) throw new Error(`upload_${put.status}`);

  let removed = 0;
  const list = await send(api(`/object/list/${BACKUP_BUCKET}`), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: "daily/", limit: 1000 }),
  });
  if (list.ok) {
    const names = ((await list.json()) as { name: string }[]).map((o) => o.name);
    const old = expiredBackups(names, now).map((n) => (n.startsWith("daily/") ? n : `daily/${n}`));
    if (old.length) {
      const del = await send(api(`/object/${BACKUP_BUCKET}`), {
        method: "DELETE",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: old }),
      });
      if (del.ok) removed = old.length;
    }
  }
  return { path, bytes: body.length, removed };
}
