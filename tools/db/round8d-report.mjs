// Round 8d, one-off READ-ONLY report printed in the production build log
// (nobody holds the production database password locally; see
// migrate-on-production-build.mjs). Replaces the round 8c report. Production
// builds only. Inside a READ ONLY transaction it prints:
// - the search quota reset of round 8d (accounts and searches it covered);
// - the founder's account that the round 8d migration marked Test, with the
//   status it had before and the facts the search eligibility reads (email
//   verified, adult, profile 100%), by user id and masked email;
// - which Data API roles can reach which tables, the RLS state, Storage
//   buckets and their policies (round 8d security check, docs/SECURITY.md);
// - admin accounts and whether each has a verified two-factor factor.
// It never prints a URL, a key or a password, never fails or holds up the
// build (timeouts, always closes, exits 0). Remove it after round 8d.
import { createRequire } from "node:module";
import { migrationUrl } from "./migration-url.mjs";

const require = createRequire(import.meta.url);
const done = () => process.exit(0);
setTimeout(() => {
  console.log("[r8d-report] stopped: 30 s limit");
  done();
}, 30_000).unref();

if ((process.env.VERCEL_ENV ?? "") !== "production") done();
const target = migrationUrl(process.env);
if (!target) done();

const mask = (email) => {
  const at = String(email).lastIndexOf("@");
  return at < 0 ? "***" : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};
const log = (s) => console.log(`[r8d-report] ${s}`);

let c;
try {
  const { Client } = require("pg");
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

  const section = async (name, run) => {
    await c.query(`SAVEPOINT s`);
    try {
      await run();
      await c.query(`RELEASE SAVEPOINT s`);
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT s`).catch(() => {});
      log(`${name}: not readable (${e.code ?? e.name ?? "error"})`);
    }
  };

  await section("reset", async () => {
    const a = await c.query(`select "before", "createdAt" from "AuditLog" where action = 'search.quota.reset.all' order by "createdAt"`);
    for (const r of a.rows) log(`reset at=${r.createdAt.toISOString()} before=${r.before}`);
    const u = await c.query(`select count(*) n from "User" where "searchQuotaResetAt" is not null`);
    const s = await c.query(`select count(*) n from "role_search_requests" where error = 'quota reset (round 8d)'`);
    const kept = await c.query(`select count(*) n from "role_search_requests"`);
    log(`reset accounts=${u.rows[0].n} queuedCanceled=${s.rows[0].n} searchRowsKept=${kept.rows[0].n}`);
  });

  await section("founder", async () => {
    const r = await c.query(`
      select u.id, u.email, u."accountStatus" status, u."emailVerified" is not null verified,
             a."before", ap."completenessScore" score, ap."birthDate" birth,
             (select count(*) from "Account" ac where ac."userId" = u.id and ac.provider = 'google') google,
             (select plan from "Subscription" s where s."subjectId" = u.id) plan
        from "AuditLog" a join "User" u on u.id = a."resourceId"
        left join "ArtistProfile" ap on ap."userId" = u.id
       where a.action = 'admin.account.status' and a."actorUserId" is null and a.id like 'r8d_test_%'`);
    log(`founder rows=${r.rowCount}`);
    for (const x of r.rows) {
      const adult = x.birth ? (Date.now() - new Date(x.birth).getTime()) / (365.25 * 864e5) >= 18 : null;
      log(`founder user=${x.id} ${mask(x.email)} before=${x.before} now=${x.status} verified=${x.verified} google=${x.google} adult=${adult} completeness=${x.score} plan=${x.plan ?? "FREE"}`);
    }
  });

  await section("rls", async () => {
    const t = await c.query(`
      select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
             has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon,
             has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as auth
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname in ('public', 'limelight')
       order by 1`);
    const open = t.rows.filter((r) => !r.rls || r.anon || r.auth || Number(r.policies) > 0);
    log(`rls: ${t.rowCount} table(s), ${open.length} not fully closed`);
    for (const r of open) log(`rls ${r.name} rls=${r.rls} policies=${r.policies} anon=${r.anon} authenticated=${r.auth}`);
  });

  await section("storage", async () => {
    const b = await c.query(`select id, public, file_size_limit from storage.buckets order by id`);
    for (const r of b.rows) log(`bucket ${r.id} public=${r.public} limit=${r.file_size_limit ?? "-"}`);
    const p = await c.query(`select polname, polcmd, pg_get_expr(polqual, polrelid) q from pg_policy where polrelid = 'storage.objects'::regclass order by 1`);
    log(`storage.objects policies=${p.rowCount}`);
    for (const r of p.rows) log(`storage policy ${r.polname} cmd=${r.polcmd} using=${String(r.q ?? "").slice(0, 120)}`);
  });

  await section("admin-mfa", async () => {
    const r = await c.query(`
      select u.id, u.email, u."isAdmin",
             (select count(*) from "AdminTotp" t where t."userId" = u.id and t."verifiedAt" is not null) totp
        from "User" u where u."isAdmin" = true order by u."createdAt"`);
    log(`admins=${r.rowCount}`);
    for (const x of r.rows) log(`admin user=${x.id} ${mask(x.email)} twoFactor=${Number(x.totp) > 0}`);
  });

  await c.query("ROLLBACK");
} catch (e) {
  log(`skipped: ${e.code ?? e.name ?? "error"}`);
} finally {
  await c?.end().catch(() => {});
  done();
}
