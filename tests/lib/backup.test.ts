import { describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { backupPath, exportDatabase, expiredBackups, storeBackup, SKIPPED_TABLES } from "@/lib/backup";

const local = (process.env.DATABASE_URL ?? "").includes("localhost");

describe("daily backup (round 8c)", () => {
  const now = new Date("2026-11-22T09:30:00Z");

  it("names one file a day and keeps 14 days", () => {
    expect(backupPath(now)).toBe("daily/2026-11-22.json.gz");
    expect(expiredBackups(["2026-11-07.json.gz", "2026-11-08.json.gz", "2026-11-22.json.gz", "notes.txt"], now)).toEqual([
      "2026-11-07.json.gz",
    ]);
  });

  it("stores the file gzipped in the private bucket and prunes old days", async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const send = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body });
      if (url.endsWith("/object/list/backups")) return Response.json([{ name: "2026-11-01.json.gz" }, { name: "2026-11-21.json.gz" }]);
      if (url.endsWith("/bucket")) return new Response("exists", { status: 409 });
      if (url.endsWith("/bucket/backups")) return Response.json({ id: "backups", public: false });
      return Response.json({});
    });
    const res = await storeBackup(
      { version: 1, createdAt: now.toISOString(), lastMigration: "m", tables: { "public.User": [{ id: "u" }] } },
      now,
      { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" },
      send as never
    );
    expect(res).toMatchObject({ path: "daily/2026-11-22.json.gz", removed: 1 });
    const put = calls.find((c) => c.url.endsWith("/object/backups/daily/2026-11-22.json.gz"))!;
    expect(JSON.parse(gunzipSync(put.body as Uint8Array).toString()).tables["public.User"]).toEqual([{ id: "u" }]);
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(JSON.parse(del.body as string)).toEqual({ prefixes: ["daily/2026-11-01.json.gz"] });
  });

  it("turns a bucket made public by hand back to private, and stops on a failed upload", async () => {
    const methods: string[] = [];
    const send = vi.fn(async (url: string, init: RequestInit = {}) => {
      methods.push(`${init.method ?? "GET"} ${url.replace("https://x.supabase.co/storage/v1", "")}`);
      if (url.endsWith("/bucket")) return new Response("exists", { status: 409 });
      if (url.endsWith("/bucket/backups") && (init.method ?? "GET") === "GET") return Response.json({ public: true });
      if (url.includes("/object/backups/daily/")) return new Response("no", { status: 403 });
      return Response.json({});
    });
    await expect(
      storeBackup({ version: 1, createdAt: "", lastMigration: null, tables: {} }, now, { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, send as never)
    ).rejects.toThrow("upload_403");
    expect(methods).toContain("PUT /bucket/backups");
  });

  it("leaves sign-in sessions and email tokens out", () => {
    expect(SKIPPED_TABLES.has("public.Session")).toBe(true);
    expect(SKIPPED_TABLES.has("public.VerificationToken")).toBe(true);
  });

  it("refuses to run without the storage keys", async () => {
    await expect(storeBackup({ version: 1, createdAt: "", lastMigration: null, tables: {} }, now, {})).rejects.toThrow(
      "storage_not_configured"
    );
  });

  it.skipIf(!local)("exports every app table of the local database, Geo tables left out", async () => {
    const { prisma } = await import("@/lib/db");
    const file = await exportDatabase(prisma as never, now);
    expect(Object.keys(file.tables)).toContain("public.User");
    expect(Object.keys(file.tables)).toContain("limelight.LimelightLead");
    for (const k of SKIPPED_TABLES) expect(file.tables[k]).toBeUndefined();
    expect(file.lastMigration).toMatch(/^202[67]/);
    expect(Array.isArray(file.tables["public.User"])).toBe(true);
  });
});
