/**
 * Static checks on the SQL in prisma/migrations, read as text, so they run in
 * `bun run test` with no database. tests/db/migration-guards.test.ts applies
 * them to every migration in the repository.
 *
 * They hold the rules from docs/DATA_SECURITY.md that a review can miss:
 *   - roles and passwords are created by hand in each environment, because the
 *     repository is public;
 *   - FORCE ROW LEVEL SECURITY stays off: Prisma connects as the table owner,
 *     and a forced table with no policy returns zero rows to it;
 *   - anon, authenticated and PUBLIC receive no grants;
 *   - a table created in public enables RLS in the same migration, and a
 *     function or procedure created in public revokes EXECUTE from PUBLIC,
 *     which Postgres grants on every new routine.
 */

export interface MigrationSource {
  /** Folder name, such as 20261119000000_lock_public_grants. */
  name: string;
  sql: string;
}

/**
 * The first migration that enabled RLS. Its loop covered every table created
 * up to it, so the per-table rules apply to later migrations only.
 */
export const RLS_BASELINE = "20261118000000_enable_rls";

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
/** An optionally schema-qualified name. Groups: schema (optional), name. */
const NAME = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`;

const ROLE_OR_PASSWORD = /\b(?:create|alter)\s+(?:role|user)\b|\bpassword\b/i;
const FORCE_RLS = /(\bno\s+)?\bforce\s+row\s+level\s+security\b/gi;
const GRANT_TO = /\bgrant\b[^;]*?\bto\s+([^;]*)/gi;
const API_ROLES = /\b(?:anon|authenticated|public)\b/i;
const CREATE_TABLE = new RegExp(
  String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`,
  "gi"
);
const ENABLE_RLS = new RegExp(
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+enable\s+row\s+level\s+security\b`,
  "gi"
);
const RLS_LOOP =
  /execute\s+format\s*\(\s*'alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security'/gi;
const CREATE_ROUTINE = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${NAME}`,
  "gi"
);
const REVOKE_FROM_PUBLIC = /\brevoke\s+(?:all(?:\s+privileges)?|execute)\s+on\s+[^;]*\bfrom\s+[^;]*\bpublic\b/gi;

/** Drops `--` and block comments, which may quote any of the patterns above. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Postgres folds unquoted identifiers to lower case and keeps quoted ones. */
function unquote(identifier: string): string {
  return identifier.startsWith('"') ? identifier.slice(1, -1) : identifier.toLowerCase();
}

/** Objects created in public (or unqualified, which lands in public). */
function createdInPublic(sql: string, pattern: RegExp): { name: string; at: number }[] {
  return [...sql.matchAll(pattern)]
    .filter((m) => m[1] === undefined || unquote(m[1]) === "public")
    .map((m) => ({ name: unquote(m[2]), at: m.index ?? 0 }));
}

function positions(sql: string, pattern: RegExp): number[] {
  return [...sql.matchAll(pattern)].map((m) => m.index ?? 0);
}

/** Every rule this migration breaks, one line each. Empty when it is clean. */
export function migrationProblems(migration: MigrationSource): string[] {
  const sql = stripSqlComments(migration.sql);
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${migration.name}: ${message}`);

  if (ROLE_OR_PASSWORD.test(sql)) {
    say("creates or alters a role, or contains a password. Roles are created by hand in each environment.");
  }
  if ([...sql.matchAll(FORCE_RLS)].some((m) => m[1] === undefined)) {
    say("forces row level security. Prisma connects as the owner, so a forced table without a policy returns no rows to the app.");
  }
  if ([...sql.matchAll(GRANT_TO)].some((m) => API_ROLES.test(m[1]))) {
    say("grants a privilege to anon, authenticated or PUBLIC.");
  }

  if (migration.name <= RLS_BASELINE) return problems;

  const enabled = new Set(createdInPublic(sql, ENABLE_RLS).map((t) => t.name));
  const loops = positions(sql, RLS_LOOP);
  for (const table of createdInPublic(sql, CREATE_TABLE)) {
    if (enabled.has(table.name) || loops.some((at) => at > table.at)) continue;
    say(`creates table ${table.name} in public without enabling row level security on it.`);
  }

  const revokes = positions(sql, REVOKE_FROM_PUBLIC);
  for (const routine of createdInPublic(sql, CREATE_ROUTINE)) {
    if (revokes.some((at) => at > routine.at)) continue;
    say(`creates routine ${routine.name} in public without revoking EXECUTE from PUBLIC.`);
  }
  return problems;
}
