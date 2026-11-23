// Round 8c, one-off READ-ONLY report printed in the production build log
// (nobody holds the production database password locally; see
// migrate-on-production-build.mjs). Production builds only. It reads, inside a
// READ ONLY transaction, and prints:
// - the profiles whose city or phone round 8 could not link (who sees the
//   "pick your city / fix your number" prompt);
// - the database and Storage sizes, against the Supabase Free plan limits.
// It never prints a URL, a key or a password, and it never fails the build.
// Remove it once round 8c has read its output.
import { createRequire } from "node:module";
import { migrationUrl } from "./migration-url.mjs";

const require = createRequire(import.meta.url);

if ((process.env.VERCEL_ENV ?? "") !== "production") process.exit(0);
const target = migrationUrl(process.env);
if (!target) process.exit(0);

const mb = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;
try {
  const { Client } = require("pg");
  const c = new Client({ connectionString: target.url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const relink = await c.query(`
    select u.email, u."accountStatus" as status, ap.city,
           (ap.city is not null and btrim(ap.city) <> '' and ap."cityGeonameId" is null) as city_unlinked,
           (ap.phone is not null and btrim(ap.phone) <> '' and ap."phoneE164" is null) as phone_unlinked
      from "ArtistProfile" ap join "User" u on u.id = ap."userId"
     where (ap.city is not null and btrim(ap.city) <> '' and ap."cityGeonameId" is null)
        or (ap.phone is not null and btrim(ap.phone) <> '' and ap."phoneE164" is null)
     order by u.email`);
  console.log(`[r8c-report] relink: ${relink.rowCount} profile(s)`);
  for (const r of relink.rows)
    console.log(
      `[r8c-report] relink ${r.email} status=${r.status} city=${r.city_unlinked ? JSON.stringify(r.city) : "-"} phone=${r.phone_unlinked ? "unlinked" : "-"}`
    );
  const db = await c.query("select pg_database_size(current_database()) as size");
  console.log(`[r8c-report] database size: ${mb(db.rows[0].size)} (Free plan: 500 MB)`);
  const tables = await c.query(`
    select relname, pg_total_relation_size(c.oid) as size
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'limelight', 'storage', 'auth')
     order by size desc limit 8`);
  for (const t of tables.rows) console.log(`[r8c-report] table ${t.relname}: ${mb(t.size)}`);
  try {
    const st = await c.query(`
      select bucket_id, count(*) as n, coalesce(sum((metadata->>'size')::bigint), 0) as size
        from storage.objects group by bucket_id order by size desc`);
    let total = 0;
    for (const b of st.rows) {
      total += Number(b.size);
      console.log(`[r8c-report] storage ${b.bucket_id}: ${b.n} file(s), ${mb(b.size)}`);
    }
    console.log(`[r8c-report] storage total: ${mb(total)} (Free plan: 1 GB)`);
  } catch (e) {
    console.log(`[r8c-report] storage not readable: ${e.code ?? "error"}`);
  }
  const users = await c.query(`select "accountStatus" as s, count(*) as n from "User" group by 1 order by 1`);
  console.log(`[r8c-report] accounts by status: ${users.rows.map((r) => `${r.s}=${r.n}`).join(" ")}`);
  await c.query("ROLLBACK");
  await c.end();
} catch (e) {
  console.log(`[r8c-report] skipped: ${e.code ?? e.name ?? "error"}`);
}
