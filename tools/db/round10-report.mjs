// Round 10, one-off READ-ONLY report printed in the production build log
// (nobody holds the production database password locally; see
// migrate-on-production-build.mjs). Replaces the round 9 report. Production
// builds only, inside a READ ONLY transaction. Prints counts, masked emails and,
// for the two accounts the founder named in the round 10 brief (matched by the
// SHA-256 of the lowercase email, so no address is in this public file), the
// facts behind "Start finding roles": type, status, email verified, the
// required profile fields present or not, searches this period. It never prints
// a URL, a key, a password, a phone number or any profile text, never fails or
// holds up the build (timeouts, always closes, exits 0). Remove after round 10.
import { createRequire } from "node:module";
import { migrationUrl } from "./migration-url.mjs";

const require = createRequire(import.meta.url);
const done = () => process.exit(0);
setTimeout(() => {
  console.log("[r10-report] stopped: 30 s limit");
  done();
}, 30_000).unref();

if ((process.env.VERCEL_ENV ?? "") !== "production") done();
const target = migrationUrl(process.env);
if (!target) done();

const TARGETS = {
  // The new account the founder created with email and password (round 10 brief).
  founder_new: "eb64732791affe41f94ef0eb67eff2f2392980280a53ca5f95a09c028e1b1b7c",
  // The founder's Test account (round 8d).
  founder_test: "89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c",
};

const mask = (email) => {
  const at = String(email).lastIndexOf("@");
  return at < 0 ? "***" : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};
const log = (s) => console.log(`[r10-report] ${s}`);
const has = (v) => (typeof v === "string" ? v.trim().length > 0 : v != null);

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

  log(`env mode=${(process.env.WORKFLOW_MODE ?? "").trim() === "live" ? "live" : "staging"} resend=${has(process.env.RESEND_API_KEY)} emailFrom=${has(process.env.EMAIL_FROM)} n8nSecret=${has(process.env.N8N_SHARED_SECRET)}`);

  await section("targets", async () => {
    for (const [label, hash] of Object.entries(TARGETS)) {
      const r = await c.query(
        `select u.id, u.email, u.kind, u."isAdmin", u."isStaff", u."accountStatus", u."emailVerified", u."deletedAt",
                u."createdAt", u."lastSignInAt", u."passwordHash" is not null pw, u."searchQuotaResetAt",
                u."searchPeriodStartedAt", u."agentsOptInAt", u."onboardingCompletedAt",
                (select string_agg(a.provider, ',') from "Account" a where a."userId" = u.id) providers,
                (select count(*) from "EmailLog" e where lower(e."to") = lower(u.email)) emails,
                (select string_agg(distinct e.kind || ':' || e.status, ',') from "EmailLog" e where lower(e."to") = lower(u.email)) email_kinds
           from "User" u
          where encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = $1`,
        [hash]
      );
      if (r.rows.length === 0) {
        log(`${label}: no account`);
        continue;
      }
      const u = r.rows[0];
      log(`${label}: user=${u.id} ${mask(u.email)} kind=${u.kind} admin=${u.isAdmin} staff=${u.isStaff} status=${u.accountStatus} verified=${u.emailVerified ? u.emailVerified.toISOString() : "no"} deleted=${!!u.deletedAt} created=${u.createdAt.toISOString()} lastSignIn=${u.lastSignInAt?.toISOString() ?? "none"} password=${u.pw} providers=${u.providers ?? "none"} optIn=${u.agentsOptInAt?.toISOString() ?? "none"} quotaReset=${u.searchQuotaResetAt?.toISOString() ?? "none"} period=${u.searchPeriodStartedAt?.toISOString() ?? "none"} emails=${u.emails} ${u.email_kinds ?? ""}`);
      const p = await c.query(
        `select p.id, p."legalFirstName", p."legalLastName", p."legalName", p."birthDate", p.gender, p.city,
                p."cityGeonameId", p.phone, p.bio, p.physical, p.preferences, p."minRateCents",
                p."completenessScore", p."isMinor",
                (select count(*) from "Media" m where m."profileId" = p.id and m.type = 'PHOTO' and coalesce(m.category, 'SELF') = 'SELF') photos
           from "ArtistProfile" p where p."userId" = $1`,
        [u.id]
      );
      if (p.rows.length === 0) {
        log(`${label}: no profile`);
      } else {
        const x = p.rows[0];
        let ph = {};
        let pr = {};
        try { ph = JSON.parse(x.physical ?? "{}") ?? {}; } catch {}
        try { pr = JSON.parse(x.preferences ?? "{}") ?? {}; } catch {}
        const adult = x.birthDate ? (Date.now() - x.birthDate.getTime()) / (365.25 * 864e5) >= 18 : null;
        log(`${label}: profile cached=${x.completenessScore} minor=${x.isMinor} adult=${adult} legal=${has(x.legalFirstName) && has(x.legalLastName) || has(x.legalName)} birth=${has(x.birthDate)} gender=${has(x.gender)} city=${has(x.city) || x.cityGeonameId != null} phone=${has(x.phone)} bio=${has(x.bio)} languages=${(ph.languages ?? []).length} height=${ph.heightCm != null} build=${has(ph.build)} hair=${has(ph.hair)} eyes=${has(ph.eyes)} photos=${x.photos} workTypes=${(pr.projectTypes ?? []).length + (pr.roleTypes ?? []).length} ages=${pr.playableAgeMin != null && pr.playableAgeMax != null} pay=${pr.compensation ?? "none"} rate=${x.minRateCents ?? 0}`);
      }
      const s = await c.query(
        `select status, count(*) n, max("createdAt") last from "role_search_requests" where "userId" = $1 group by 1 order by 1`,
        [u.id]
      );
      for (const y of s.rows) log(`${label}: searches status=${y.status} n=${y.n} last=${y.last.toISOString()}`);
      const a = await c.query(
        `select action, count(*) n from "AuditLog" where "resourceId" = $1 or "actorUserId" = $1 group by 1 order by 2 desc limit 15`,
        [u.id]
      );
      for (const y of a.rows) log(`${label}: audit ${y.action} n=${y.n}`);
    }
  });

  await section("accounts", async () => {
    const r = await c.query(`select kind, "accountStatus" s, "isAdmin" a, ("deletedAt" is not null) d, ("emailVerified" is not null) v, count(*) n from "User" group by 1,2,3,4,5 order by 1,2`);
    for (const x of r.rows) log(`accounts kind=${x.kind} status=${x.s} admin=${x.a} deleted=${x.d} verified=${x.v} n=${x.n}`);
    const t = await c.query(`select id, email, kind, "accountStatus" s from "User" where ("accountStatus" in ('TEST','STAFF') or "isAdmin") and "deletedAt" is null order by "createdAt"`);
    for (const x of t.rows) log(`marked user=${x.id} ${mask(x.email)} kind=${x.kind} status=${x.s}`);
    const m = await c.query(`select count(*) n from "Membership"`);
    log(`memberships n=${m.rows[0].n}`);
  });

  await section("model", async () => {
    const r = await c.query(`select
        count(*) filter (where "deletedAt" is null) accounts,
        count(*) filter (where "deletedAt" is null and not ("isStaff" or "isAdmin" or "accountStatus" = 'STAFF') and kind <> 'CASTING') performers,
        count(*) filter (where "deletedAt" is null and not ("isStaff" or "isAdmin" or "accountStatus" = 'STAFF') and kind = 'CASTING') casting,
        count(*) filter (where "deletedAt" is null and ("isStaff" or "isAdmin" or "accountStatus" = 'STAFF')) staff,
        count(*) filter (where "deletedAt" is null and "accountStatus" = 'TEST') test,
        count(*) filter (where "deletedAt" is not null) deleted
      from "User"`);
    const x = r.rows[0];
    log(`model accounts=${x.accounts} performers=${x.performers} casting=${x.casting} staff=${x.staff} test=${x.test} deleted=${x.deleted}`);
    const s = await c.query(`select u.id, u.email, u."accountStatus" s from "User" u where u."isStaff" and u."deletedAt" is null order by u."createdAt"`);
    for (const y of s.rows) log(`staff user=${y.id} ${mask(y.email)} test=${y.s === "TEST"}`);
    const v = await c.query(`select choice, sum(count) n from "ConsentTally" group by 1 order by 1`);
    for (const y of v.rows) log(`visitor consent choice=${y.choice} n=${y.n}`);
  });

  await section("consent", async () => {
    const r = await c.query(`select "consentAnalytics" an, "consentMarketing" mk, "consentVersion" ver, count(*) n from "User" where "deletedAt" is null group by 1,2,3 order by 4 desc`);
    for (const x of r.rows) log(`consent analytics=${x.an} marketing=${x.mk} version=${x.ver ?? "none"} n=${x.n}`);
  });

  await section("reset", async () => {
    const r = await c.query(`select count(*) n from "User" where "searchQuotaResetAt" > now() - interval '2 hours' and "deletedAt" is null`);
    log(`quota reset in the last 2 hours: accounts=${r.rows[0].n}`);
    const q = await c.query(`select count(*) n from "role_search_requests" where error = 'quota reset (round 10)'`);
    log(`queued searches canceled by the round 10 reset=${q.rows[0].n}`);
  });

  await section("searches", async () => {
    const r = await c.query(`select status, count(*) n from "role_search_requests" group by 1 order by 1`);
    for (const x of r.rows) log(`search status=${x.status} n=${x.n}`);
  });

  await c.query("ROLLBACK");
} catch (e) {
  log(`skipped: ${e.code ?? e.name ?? "error"}`);
} finally {
  await c?.end().catch(() => {});
  done();
}
