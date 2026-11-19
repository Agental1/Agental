import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RLS_BASELINE,
  migrationProblems,
  stripSqlComments,
  type MigrationSource,
} from "../../tools/db/migration-guards";

/**
 * The repository's migrations are public and run against production as the
 * table owner, so the rules in docs/DATA_SECURITY.md are checked here on the
 * SQL text. The first block pins what each rule catches; the last one runs
 * them on prisma/migrations.
 */

function later(sql: string): MigrationSource {
  return { name: "20991231000000_later", sql };
}

describe("migrationProblems", () => {
  it("flags a role or a password", () => {
    expect(migrationProblems(later("CREATE ROLE agental_app LOGIN;"))).toHaveLength(1);
    expect(migrationProblems(later("ALTER ROLE agental_app WITH PASSWORD 'x';"))).toHaveLength(1);
    expect(migrationProblems(later("CREATE USER MAPPING FOR postgres SERVER s;"))).toHaveLength(1);
  });

  it("flags FORCE ROW LEVEL SECURITY and accepts NO FORCE", () => {
    expect(migrationProblems(later('ALTER TABLE "User" FORCE ROW LEVEL SECURITY;'))).toHaveLength(1);
    expect(migrationProblems(later('ALTER TABLE "User" NO FORCE ROW LEVEL SECURITY;'))).toEqual([]);
  });

  it("flags grants to Supabase's API roles and to PUBLIC", () => {
    for (const grantee of ["anon", "authenticated", "PUBLIC", "agental_app, anon"]) {
      expect(migrationProblems(later(`GRANT SELECT ON "User" TO ${grantee};`))).toHaveLength(1);
    }
    expect(
      migrationProblems(
        later("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;")
      )
    ).toHaveLength(1);
    expect(migrationProblems(later("GRANT USAGE ON SCHEMA public TO agental_app;"))).toEqual([]);
    expect(
      migrationProblems(later("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;"))
    ).toEqual([]);
  });

  it("flags a table created in public without RLS", () => {
    const problems = migrationProblems(later('CREATE TABLE "Lead" ("id" TEXT NOT NULL);'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Lead");
  });

  it("accepts RLS by ALTER TABLE, or by a loop that runs after the CREATE", () => {
    const create = 'CREATE TABLE "Lead" ("id" TEXT NOT NULL);';
    const loop = "EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);";
    expect(
      migrationProblems(later(`${create}\nALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;`))
    ).toEqual([]);
    expect(
      migrationProblems(later(`${create}\nALTER TABLE public."Lead" ENABLE ROW LEVEL SECURITY;`))
    ).toEqual([]);
    expect(migrationProblems(later(`${create}\n${loop}`))).toEqual([]);
    expect(migrationProblems(later(`${loop}\n${create}`))).toHaveLength(1);
  });

  it("matches names the way Postgres folds them", () => {
    // "Lead" keeps its case; unquoted lead is a different table.
    const sql = 'CREATE TABLE "Lead" (id text);\nALTER TABLE lead ENABLE ROW LEVEL SECURITY;';
    expect(migrationProblems(later(sql))).toHaveLength(1);
  });

  it("flags a routine created in public that keeps EXECUTE for PUBLIC", () => {
    const fn =
      "CREATE OR REPLACE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;";
    expect(migrationProblems(later(fn))).toHaveLength(1);
    expect(
      migrationProblems(later(`${fn}\nREVOKE EXECUTE ON FUNCTION public.touch() FROM PUBLIC;`))
    ).toEqual([]);
  });

  it("leaves other schemas, and migrations up to the baseline, to their own rules", () => {
    expect(migrationProblems(later("CREATE TABLE automation.castings (id text);"))).toEqual([]);
    expect(
      migrationProblems({ name: RLS_BASELINE, sql: 'CREATE TABLE "Old" (id text);' })
    ).toEqual([]);
  });

  it("ignores comments", () => {
    const sql = "SELECT 1; -- CREATE ROLE x PASSWORD 'y'\n/* GRANT ALL ON x TO anon; */";
    expect(stripSqlComments(sql)).not.toMatch(/role|grant/i);
    expect(migrationProblems(later(sql))).toEqual([]);
  });
});

describe("prisma/migrations", () => {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const migrations: MigrationSource[] = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(dir, name, "migration.sql"), "utf8"),
    }));

  it("still contains the RLS baseline the per-table rules start from", () => {
    expect(migrations.map((m) => m.name)).toContain(RLS_BASELINE);
  });

  it("passes every guard", () => {
    expect(migrations.flatMap(migrationProblems)).toEqual([]);
  });
});
