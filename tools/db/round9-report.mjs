// Round 9, one-off READ-ONLY report printed in the production build log
// (nobody holds the production database password locally; see
// migrate-on-production-build.mjs). Replaces the round 8d report. Production
// builds only. Inside a READ ONLY transaction it prints counts and masked
// emails only: accounts by status, the Test accounts, deleted accounts, admin
// two-factor, the email log of the last 7 days by kind and status, searches by
// status and the latest casting runs, inbox replies by status. It never prints
// a URL, a key, a password or an email body, never fails or holds up the build
// (timeouts, always closes, exits 0). Remove it after round 9.
import { createRequire } from "node:module";
import { migrationUrl } from "./migration-url.mjs";

const require = createRequire(import.meta.url);
const done = () => process.exit(0);
setTimeout(() => {
  console.log("[r9-report] stopped: 30 s limit");
  done();
}, 30_000).unref();

if ((process.env.VERCEL_ENV ?? "") !== "production") done();
const target = migrationUrl(process.env);
if (!target) done();

const mask = (email) => {
  const at = String(email).lastIndexOf("@");
  return at < 0 ? "***" : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};
const log = (s) => console.log(`[r9-report] ${s}`);

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

  await section("accounts", async () => {
    const r = await c.query(`select "accountStatus" s, "isAdmin" a, ("deletedAt" is not null) d, count(*) n from "User" group by 1,2,3 order by 1`);
    for (const x of r.rows) log(`accounts status=${x.s} admin=${x.a} deleted=${x.d} n=${x.n}`);
    const t = await c.query(`select id, email, "emailVerified" is not null v from "User" where "accountStatus" = 'TEST' and "deletedAt" is null order by "createdAt"`);
    for (const x of t.rows) log(`test user=${x.id} ${mask(x.email)} verified=${x.v}`);
  });

  await section("admin-mfa", async () => {
    const r = await c.query(`
      select u.id, u.email,
             (select count(*) from "AdminTotp" t where t."userId" = u.id and t."verifiedAt" is not null) totp
        from "User" u where u."isAdmin" = true order by u."createdAt"`);
    for (const x of r.rows) log(`admin user=${x.id} ${mask(x.email)} twoFactor=${Number(x.totp) > 0}`);
  });

  await section("emails", async () => {
    const r = await c.query(`select kind, status, count(*) n from "EmailLog" where "createdAt" > now() - interval '7 days' group by 1,2 order by 1,2`);
    for (const x of r.rows) log(`email kind=${x.kind} status=${x.status} n=${x.n}`);
  });

  await section("searches", async () => {
    const r = await c.query(`select status, count(*) n from "role_search_requests" group by 1 order by 1`);
    for (const x of r.rows) log(`search status=${x.status} n=${x.n}`);
    const w = await c.query(`select status, "costMicroUsd" cost, "createdAt" at from "WorkflowRun" where kind = 'casting.search' order by "createdAt" desc limit 5`);
    for (const x of w.rows) log(`casting run status=${x.status} costMicroUsd=${x.cost} at=${x.at.toISOString()}`);
  });

  await section("inbox", async () => {
    const r = await c.query(`select status, count(*) n from "InboxReply" group by 1 order by 1`);
    for (const x of r.rows) log(`inbox status=${x.status} n=${x.n}`);
  });

  await c.query("ROLLBACK");
} catch (e) {
  log(`skipped: ${e.code ?? e.name ?? "error"}`);
} finally {
  await c?.end().catch(() => {});
  done();
}
