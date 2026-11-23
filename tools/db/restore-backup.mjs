// Restore a daily backup (src/lib/backup.ts) into a database (round 8c).
//
//   DIRECT_URL=postgres://... node tools/db/restore-backup.mjs <file.json.gz>          # dry run
//   DIRECT_URL=postgres://... node tools/db/restore-backup.mjs <file.json.gz> --apply  # restore
//
// The target is a fresh database already migrated to at least the backup's
// `lastMigration` (`pnpm db:deploy` first; the GeoNames tables come with their
// migration). The script never overwrites: it stops if a table it would fill
// already has rows. Tables are filled parents first (foreign keys), in one
// transaction, each with json_populate_recordset, so Postgres converts every
// value to its column type, with the app's triggers paused so nothing is
// added twice. The full procedure is in docs/BACKUPS.md.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const [file, flag] = process.argv.slice(2);
const apply = flag === "--apply";
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Usage: DIRECT_URL=... node tools/db/restore-backup.mjs <file.json.gz> [--apply]");
  process.exit(1);
}

const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
if (backup.version !== 1) throw new Error(`Unknown backup version ${backup.version}`);
const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;
const qualified = (key) => key.split(".").map(ident).join(".");

const { Client } = require("pg");
const c = new Client({ connectionString: url });
await c.connect();
try {
  // Parents before children, from the foreign keys between the tables to fill.
  const fks = await c.query(`
    select cn.nspname || '.' || cl.relname as child, pn.nspname || '.' || pl.relname as parent
      from pg_constraint k
      join pg_class cl on cl.oid = k.conrelid join pg_namespace cn on cn.oid = cl.relnamespace
      join pg_class pl on pl.oid = k.confrelid join pg_namespace pn on pn.oid = pl.relnamespace
     where k.contype = 'f'`);
  const keys = Object.keys(backup.tables);
  const deps = new Map(keys.map((k) => [k, new Set()]));
  for (const { child, parent } of fks.rows)
    if (deps.has(child) && deps.has(parent) && child !== parent) deps.get(child).add(parent);
  const order = [];
  const seen = new Set();
  const visit = (k, stack = new Set()) => {
    if (seen.has(k) || stack.has(k)) return;
    stack.add(k);
    for (const p of deps.get(k)) visit(p, stack);
    seen.add(k);
    order.push(k);
  };
  keys.forEach((k) => visit(k));

  const last = await c
    .query(`select max(migration_name) as m from "_prisma_migrations" where finished_at is not null`)
    .then((r) => r.rows[0].m)
    .catch(() => null);
  console.log(`backup ${backup.createdAt}, last migration ${backup.lastMigration}; target at ${last}`);
  if (backup.lastMigration && (!last || last < backup.lastMigration)) {
    throw new Error("Migrate the target first (pnpm db:deploy): it is behind the backup.");
  }

  const busy = [];
  for (const k of order) {
    const exists = await c.query(`select to_regclass($1) as t`, [qualified(k)]);
    if (!exists.rows[0].t) throw new Error(`Table ${k} is missing in the target.`);
    const n = await c.query(`select count(*)::int as n from ${qualified(k)}`);
    if (n.rows[0].n > 0 && backup.tables[k].length > 0) busy.push(`${k} (${n.rows[0].n} rows)`);
  }
  if (busy.length) throw new Error(`These tables already hold rows; nothing was changed: ${busy.join(", ")}`);

  for (const k of order) console.log(`${apply ? "restore" : "would restore"} ${k}: ${backup.tables[k].length} rows`);
  if (!apply) {
    console.log("Dry run. Add --apply to restore.");
  } else {
    await c.query("BEGIN");
    // The app's own triggers (notifications on new drafts and messages) would
    // add rows that are already in the backup: paused for the restore only.
    for (const k of order) await c.query(`alter table ${qualified(k)} disable trigger user`);
    for (const k of order) {
      const rows = backup.tables[k];
      for (let i = 0; i < rows.length; i += 500) {
        await c.query(
          `insert into ${qualified(k)} select * from json_populate_recordset(null::${qualified(k)}, $1::json)`,
          [JSON.stringify(rows.slice(i, i + 500))]
        );
      }
    }
    for (const k of order) await c.query(`alter table ${qualified(k)} enable trigger user`);
    await c.query("COMMIT");
    console.log("Restored.");
  }
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await c.end();
}
