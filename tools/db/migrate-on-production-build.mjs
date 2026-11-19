// Applies pending database migrations at the start of a PRODUCTION build.
//
// Why here: nobody holds the production database password locally. The
// hosting platform does, as DIRECT_URL, and a production build is the one
// moment new code is about to need a new schema. Running `prisma migrate
// deploy` first means the schema is in place before that code serves a
// request, and a migration that fails stops the build, so the previous
// deployment keeps serving untouched.
//
// Why production only: preview builds use the same database. A preview of any
// branch must never change it, so on previews (and locally, and in CI) this
// script does nothing. The consequence to remember: a preview of code that
// needs a migration not yet in production fails on the pages that use it.
// Test those against a local or dev database.
//
// Migrations in this repository are additive and safe to run while the
// previous code is still serving. Keep them that way: this step runs minutes
// before the switch.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { migrationUrl } from "./migration-url.mjs";

const env = process.env.VERCEL_ENV ?? "";
if (env !== "production") {
  console.log(`[migrate] skipped (VERCEL_ENV=${env || "unset"}): migrations run on production builds only`);
  process.exit(0);
}
if (process.env.SKIP_PRODUCTION_MIGRATIONS === "true") {
  console.log("[migrate] skipped: SKIP_PRODUCTION_MIGRATIONS=true");
  process.exit(0);
}
// Supabase's direct host is IPv6 only and unreachable from the build
// machines, so the session pooler is derived from DATABASE_URL when needed
// (see migration-url.mjs). The url carries the password: only `via` is logged.
const target = migrationUrl(process.env);
if (!target) {
  console.error("[migrate] neither DIRECT_URL nor DATABASE_URL is set on the Production environment; refusing to build without applying migrations.");
  process.exit(1);
}
console.log(`[migrate] connecting through ${target.via}`);
if (process.env.MIGRATE_DRY_RUN === "true") {
  console.log("[migrate] dry run: nothing applied");
  process.exit(0);
}

const bin = "node_modules/.bin/prisma";
if (!existsSync(bin)) {
  console.error("[migrate] prisma CLI not found in node_modules");
  process.exit(1);
}
console.log("[migrate] applying pending migrations before the production build");
const result = spawnSync(bin, ["migrate", "deploy"], {
  stdio: "inherit",
  // prisma.config.ts reads DIRECT_URL first.
  env: { ...process.env, DIRECT_URL: target.url },
});
if (result.status !== 0) {
  console.error("[migrate] failed; the build stops here and the current deployment keeps serving");
  process.exit(result.status ?? 1);
}
console.log("[migrate] done");
