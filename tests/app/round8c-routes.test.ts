import { afterEach, describe, expect, it, vi } from "vitest";

const exportDatabase = vi.fn();
const storeBackup = vi.fn();
const session = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/backup", () => ({ exportDatabase, storeBackup }));
vi.mock("@/auth", () => ({ auth: session }));

const backup = await import("@/app/api/cron/backup/route");
const token = await import("@/app/api/realtime/token/route");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/backup (round 8c)", () => {
  const call = (authorization?: string) =>
    backup.GET(new Request("https://app.test/api/cron/backup", { headers: authorization ? { authorization } : {} }));

  it("is 404 while CRON_SECRET is unset, even with a token", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(404);
    expect(exportDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", undefined],
    ["a wrong token", "Bearer wrong-secret-value"],
    ["another scheme", "Basic cron-secret-value"],
  ])("is 401 with %s, and reads nothing", async (_l, authorization) => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const res = await call(authorization);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
    expect(exportDatabase).not.toHaveBeenCalled();
  });

  it("backs up with the right token and answers counts only", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    exportDatabase.mockResolvedValue({ version: 1, createdAt: "", lastMigration: "m", tables: { "public.User": [{ id: "u", email: "a@b.c" }] } });
    storeBackup.mockResolvedValue({ path: "daily/2026-11-22.json.gz", bytes: 120, removed: 0 });
    const res = await call("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, path: "daily/2026-11-22.json.gz", bytes: 120, tables: 1, rows: 1, removed: 0 });
    expect(JSON.stringify(body)).not.toContain("a@b.c");
  });

  it("answers 500 with nothing else when the backup fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    exportDatabase.mockRejectedValue(new Error("boom"));
    const res = await call("Bearer cron-secret-value");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });
});

describe("GET /api/realtime/token (round 8c)", () => {
  const configure = () => {
    vi.stubEnv("SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
    vi.stubEnv("SUPABASE_JWT_SECRET", "x".repeat(40));
  };

  it("is 404 while Realtime is not configured", async () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    session.mockResolvedValue({ user: { id: "u1" } });
    expect((await token.GET()).status).toBe(404);
  });

  it("is 401 without a session", async () => {
    configure();
    session.mockResolvedValue(null);
    expect((await token.GET()).status).toBe(401);
  });

  it("gives the signed-in person a token for their own topic only, never cached", async () => {
    configure();
    session.mockResolvedValue({ user: { id: "u1" } });
    const res = await token.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.topic).toBe("notifications:u1");
    const payload = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString());
    expect(payload).toMatchObject({ sub: "u1", role: "authenticated", aud: "authenticated" });
  });
});
