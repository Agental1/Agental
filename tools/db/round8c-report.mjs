// Round 8c, one-off READ-ONLY report printed in the production build log
// (nobody holds the production database password locally; see
// migrate-on-production-build.mjs). Production builds only. It reads, inside a
// READ ONLY transaction, and prints:
// - the profiles whose city or phone round 8 could not link (who sees the
//   "pick your city / fix your number" prompt), by user id and masked email;
// - the database and Storage sizes, against the Supabase Free plan limits;
// - which Data API roles can reach which tables, and the RLS state (round 8c
//   security pass, written up in docs/SECURITY.md);
// - the accounts Admin > Account cleanup would list for deletion (masked),
//   for the founders' go (group 5). Nothing is deleted here.
// It never prints a URL, a key or a password, and it never fails or holds up
// the build: every step has a timeout, the connection is always closed, and the
// process exits 0. Remove it once round 8c has read its output.
import { createRequire } from "node:module";
import { migrationUrl } from "./migration-url.mjs";

const require = createRequire(import.meta.url);
const done = () => process.exit(0);
// Whatever happens below, the build goes on after 30 seconds.
setTimeout(() => {
  console.log("[r8c-report] stopped: 30 s limit");
  done();
}, 30_000).unref();

if ((process.env.VERCEL_ENV ?? "") !== "production") done();
const target = migrationUrl(process.env);
if (!target) done();

const mb = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;
// "jane.doe@gmail.com" -> "ja***@gmail.com": enough to recognize a test account.
const mask = (email) => {
  const at = String(email).lastIndexOf("@");
  return at < 0 ? "***" : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};

// Same rule as src/domain/relink.ts: a city typed but never picked, a phone
// typed but never checked (null or empty E.164).
const CITY_UNLINKED = `(btrim(coalesce(ap.city, '')) <> '' and ap."cityGeonameId" is null)`;
const PHONE_UNLINKED = `(btrim(coalesce(ap.phone, '')) <> '' and coalesce(ap."phoneE164", '') = '')`;

let c;
try {
  const { Client } = require("pg");
  // sslmode in the URL would override the ssl object below; libpq's
  // sslmode=require (encrypted, certificate not checked: Supabase's pooler CA is
  // not in Node's store) is what the ssl object says, as for `prisma migrate`.
  const url = new URL(target.url);
  url.searchParams.delete("sslmode");
  c = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
  });
  c.on("error", () => {});
  await c.connect();
  await c.query("BEGIN READ ONLY");

  // One failed section never aborts the others.
  const section = async (name, run) => {
    await c.query(`SAVEPOINT s`);
    try {
      await run();
      await c.query(`RELEASE SAVEPOINT s`);
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT s`).catch(() => {});
      console.log(`[r8c-report] ${name}: not readable (${e.code ?? e.name ?? "error"})`);
    }
  };

  await section("relink", async () => {
    const r = await c.query(`
      select u.id, u.email, u."accountStatus" as status, ap.city,
             ${CITY_UNLINKED} as city_unlinked, ${PHONE_UNLINKED} as phone_unlinked
        from "ArtistProfile" ap join "User" u on u.id = ap."userId"
       where ${CITY_UNLINKED} or ${PHONE_UNLINKED}
       order by u."createdAt"`);
    console.log(`[r8c-report] relink: ${r.rowCount} profile(s)`);
    for (const x of r.rows)
      console.log(
        `[r8c-report] relink user=${x.id} ${mask(x.email)} status=${x.status} city=${
          x.city_unlinked ? JSON.stringify(String(x.city).slice(0, 40)) : "-"
        } phone=${x.phone_unlinked ? "unlinked" : "-"}`
      );
  });

  await section("database size", async () => {
    const db = await c.query("select pg_database_size(current_database()) as size");
    console.log(`[r8c-report] database size: ${mb(db.rows[0].size)} (Free plan: 500 MB)`);
    const tables = await c.query(`
      select n.nspname || '.' || c.relname as name, pg_total_relation_size(c.oid) as size
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public', 'limelight', 'storage', 'auth')
       order by size desc limit 8`);
    for (const t of tables.rows) console.log(`[r8c-report] table ${t.name}: ${mb(t.size)}`);
  });

  await section("storage", async () => {
    const st = await c.query(`
      select bucket_id, count(*) as n,
             coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint end), 0) as size
        from storage.objects group by bucket_id order by size desc`);
    let total = 0;
    for (const b of st.rows) {
      total += Number(b.size);
      console.log(`[r8c-report] storage ${b.bucket_id}: ${b.n} file(s), ${mb(b.size)}`);
    }
    console.log(`[r8c-report] storage total: ${mb(total)} (Free plan: 1 GB)`);
  });

  await section("accounts", async () => {
    const users = await c.query(`select "accountStatus" as s, count(*) as n from "User" group by 1 order by 1`);
    console.log(`[r8c-report] accounts by status: ${users.rows.map((r) => `${r.s}=${r.n}`).join(" ")}`);
  });

  await section("deletion", async () => {
    // Same rule as listDeletionCandidates (src/lib/admin/account-deletion.ts):
    // never verified, password account, 7+ days old, not admin, not STAFF /
    // TEST / APPROVED, never paid, no organization, and a warning older than 7 days.
    const r = await c.query(`
      select u.id, u.email, u.kind, u."createdAt", u."accountStatus" as status, u."deletionWarnedAt" as warned,
             (select count(*) from "Media" m join "ArtistProfile" ap on ap.id = m."profileId" where ap."userId" = u.id) as media
        from "User" u
       where u."emailVerified" is null and u."passwordHash" is not null and not u."isAdmin"
         and u."createdAt" <= now() - interval '7 days'
         and coalesce(u."accountStatus", '') not in ('STAFF', 'TEST', 'APPROVED')
         and (u."deletionWarnedAt" is null or u."deletionWarnedAt" <= now() - interval '7 days')
         and not exists (select 1 from "Membership" mb where mb."userId" = u.id)
         and not exists (select 1 from "Subscription" s where s."subjectType" = 'ARTIST' and s."subjectId" = u.id
                           and (s."stripeSubscriptionId" is not null or s.plan <> 'FREE'))
         and not exists (select 1 from "SiteOrder" o where o."userId" = u.id
                           and (o."paidAt" is not null or o.status in ('PAID', 'REFUNDED')))
       order by u."createdAt"`);
    const unverifiedAll = await c.query(`select count(*) as n from "User" where "emailVerified" is null`);
    console.log(`[r8c-report] deletion: ${r.rowCount} eligible (of ${unverifiedAll.rows[0].n} unverified accounts)`);
    for (const x of r.rows)
      console.log(
        `[r8c-report] deletion user=${x.id} ${mask(x.email)} ${x.kind} created=${x.createdAt.toISOString().slice(0, 10)} status=${x.status} warned=${x.warned ? x.warned.toISOString().slice(0, 10) : "-"} media=${x.media}`
      );
  });

  await section("rls", async () => {
    // Every table in the app schemas: RLS on or off, policy count, and any
    // privilege the Data API roles hold (anon, authenticated).
    const t = await c.query(`
      select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
             has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon,
             has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as auth
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname in ('public', 'limelight')
       order by 1`);
    const open = t.rows.filter((r) => !r.rls || r.anon || r.auth || Number(r.policies) > 0);
    console.log(`[r8c-report] rls: ${t.rowCount} table(s), ${open.length} not fully closed`);
    for (const r of open)
      console.log(`[r8c-report] rls ${r.name} rls=${r.rls} policies=${r.policies} anon=${r.anon} authenticated=${r.auth}`);
    const pub = await c.query(`select count(*) as n from pg_publication_tables where pubname = 'supabase_realtime'`);
    console.log(`[r8c-report] realtime publication tables: ${pub.rows[0].n}`);
  });

  await c.query("ROLLBACK");
} catch (e) {
  console.log(`[r8c-report] skipped: ${e.code ?? e.name ?? "error"}`);
} finally {
  await c?.end().catch(() => {});
  done();
}
