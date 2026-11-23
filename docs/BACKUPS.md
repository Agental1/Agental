# Database backups (round 8c, 2026-11-22)

## Why

The Supabase Free plan keeps no backup you can download or restore from the dashboard. Supabase
Pro ($25/month) adds 7 days of daily backups; point-in-time recovery is a paid add-on on top of
Pro. Until the founders move to Pro, the app keeps its own daily copy, at no cost.

## What runs

- **When:** every day at 09:30 UTC, a Vercel cron (`vercel.json`) calls `GET /api/cron/backup`.
- **Who may call it:** Vercel sends `Authorization: Bearer <CRON_SECRET>`. Without `CRON_SECRET`
  in Vercel the route answers 404 and no backup runs (founder action: see HANDOFF).
- **What it copies:** every table of the `public` and `limelight` schemas, as JSON, in one
  read-only, repeatable-read transaction (one consistent snapshot). Left out: the GeoNames tables
  (`GeoCountry`, `GeoAdmin1`, `GeoCity`, reloaded by their migration) and `RateLimitEvent`
  (short-lived counters). Supabase's own `auth` and `storage` schemas are not app data.
- **Where:** Supabase Storage, private bucket `backups`, file `daily/YYYY-MM-DD.json.gz`. The
  bucket has no policy: only the service key reads it. Files older than 14 days are removed.
- **Size:** about 1 MB a day compressed today (30 MB database, 16 MB of it GeoNames), so 14 days
  use well under 1% of the Free plan's 1 GB.
- **Media files** (photos, videos in Storage) are not in this backup. They stay in their own
  buckets; deleting an account deletes its files.

Check it ran: Vercel > agental > Logs, filter `[backup]`, or Supabase > Storage > `backups`.

## How to restore

The restore never overwrites: it refuses to run if a table it would fill already has rows.

1. Download the file: Supabase > Storage > `backups` > `daily/` > the day you want > Download.
2. Make an empty database at the same schema version. For a full restore into a new Supabase
   project: create the project, then from this repository
   `DIRECT_URL=<new project's session pooler URL> pnpm db:deploy`
   (the backup header names the last migration it needs: `lastMigration`).
3. Dry run, which lists every table and its row count:
   `DIRECT_URL=<same URL> node tools/db/restore-backup.mjs ~/Downloads/2026-11-22.json.gz`
4. Restore:
   `DIRECT_URL=<same URL> node tools/db/restore-backup.mjs ~/Downloads/2026-11-22.json.gz --apply`
   It fills the tables parents first (foreign keys), in one transaction, with the app's own
   triggers paused so no notification is added twice. Any error rolls everything back.
5. Point Vercel's `DATABASE_URL` and `DIRECT_URL` at the new database and redeploy.

Only a founder holds the database password, so steps 2 to 5 are theirs (or done with them).

## Tested

2026-11-22, locally: a backup of the local database (52 tables, 324 rows) restored into a fresh,
migrated database gave the same row counts in every table checked and the same hash of every
user's email and password hash. The first drill found duplicate notifications from the triggers;
the restore now pauses them.
