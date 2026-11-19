import { describe, expect, it } from "vitest";
import { migrationUrl } from "../../tools/db/migration-url.mjs";

/**
 * The connection the production build migrates through. The case that broke
 * a deploy: DIRECT_URL pointed at Supabase's direct host, which build
 * machines cannot reach, and the build stopped with P1001.
 */
const pick = migrationUrl as (env: Record<string, string | undefined>) =>
  | { url: string; via: string; derived: boolean }
  | null;

const POOLED = "postgresql://postgres.abcdefgh:s3cr%40t@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
const SESSION = "postgresql://postgres.abcdefgh:s3cr%40t@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
const DIRECT = "postgresql://postgres:s3cr%40t@db.abcdefgh.supabase.co:5432/postgres";

describe("migrationUrl", () => {
  it("derives the session pooler from DATABASE_URL when DIRECT_URL is the IPv6-only host", () => {
    const target = pick({ DIRECT_URL: DIRECT, DATABASE_URL: POOLED });
    expect(target).toMatchObject({ url: SESSION, derived: true });
  });

  it("derives it as well when DIRECT_URL is missing", () => {
    expect(pick({ DATABASE_URL: POOLED })?.url).toBe(SESSION);
    expect(pick({ DIRECT_URL: "  ", DATABASE_URL: POOLED })?.url).toBe(SESSION);
  });

  it("keeps the user, the encoded password and the database name", () => {
    const url = new URL(pick({ DIRECT_URL: DIRECT, DATABASE_URL: POOLED })!.url);
    expect(url.username).toBe("postgres.abcdefgh");
    expect(url.password).toBe("s3cr%40t");
    expect(url.pathname).toBe("/postgres");
    expect(url.search).toBe("");
  });

  it("takes a DIRECT_URL that already is the session pooler, or any other host, as given", () => {
    expect(pick({ DIRECT_URL: SESSION, DATABASE_URL: POOLED })).toMatchObject({ url: SESSION, derived: false });
    const local = "postgres://postgres:postgres@localhost:51218/template1?sslmode=disable";
    expect(pick({ DIRECT_URL: local, DATABASE_URL: local })).toMatchObject({ url: local, derived: false });
  });

  it("falls back to the direct host when DATABASE_URL is no pooler", () => {
    expect(pick({ DIRECT_URL: DIRECT, DATABASE_URL: DIRECT })).toMatchObject({ url: DIRECT, derived: false });
    expect(pick({ DIRECT_URL: DIRECT })?.url).toBe(DIRECT);
  });

  it("answers null with nothing to connect to", () => {
    expect(pick({})).toBeNull();
    expect(pick({ DIRECT_URL: "not a url", DATABASE_URL: "" })).toBeNull();
  });

  it("never puts the password in what gets logged", () => {
    for (const env of [
      { DIRECT_URL: DIRECT, DATABASE_URL: POOLED },
      { DIRECT_URL: SESSION },
      { DIRECT_URL: DIRECT },
    ]) {
      const via = pick(env)!.via;
      expect(via).not.toContain("s3cr");
      expect(via).not.toContain("postgres.abcdefgh");
    }
  });
});
