import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createShareLink and revokeShareLink with a mocked session, request headers
 * and database. What is under test: only the owner of a READY clip gets a
 * link, the limits hold, the token is returned once and stored only as a
 * hash, and the audit entries never carry it.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };
let requestHeaders: Record<string, string> = {};

const tx = {
  $queryRaw: vi.fn(),
  mediaShare: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
const db = {
  mediaShare: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

const { createShareLink, revokeShareLink } = await import("@/app/actions/share");

const NOW = new Date("2026-11-19T10:00:00Z");
const HOUR = 60 * 60 * 1000;
const SITE = "https://www.agental.test";

const refusal = (key: string, values?: Record<string, number>) => ({
  ok: false,
  error: values ? { key, values } : { key },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("AUTH_URL", "");
  session = { user: { id: "u1", kind: "TALENT" } };
  requestHeaders = {};
  tx.$queryRaw.mockResolvedValue([{ status: "READY", isMinor: false }]);
  tx.mediaShare.count.mockResolvedValue(0);
  tx.mediaShare.create.mockResolvedValue({ id: "s1" });
  tx.mediaShare.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("createShareLink", () => {
  it("is refused without a session or for a casting account", async () => {
    session = null;
    expect(await createShareLink("m1")).toEqual(refusal("errors.unauthorized"));
    session = { user: { id: "u1", kind: "CASTING" } };
    expect(await createShareLink("m1")).toEqual(refusal("errors.unauthorized"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers not found for an id that cannot be one", async () => {
    expect(await createShareLink("")).toEqual(refusal("errors.mediaNotFound"));
    expect(await createShareLink("x".repeat(101))).toEqual(refusal("errors.mediaNotFound"));
    expect(await createShareLink(7 as unknown as string)).toEqual(refusal("errors.mediaNotFound"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a lifetime that is not a number", async () => {
    expect(
      await createShareLink("m1", { expiresInHours: "24" as unknown as number })
    ).toEqual(refusal("errors.invalidInput"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers not found for a clip that is missing or belongs to someone else", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    expect(await createShareLink("m-other")).toEqual(refusal("errors.mediaNotFound"));
    // The owner comes from the session and is part of the one statement that
    // finds and locks the clip.
    const [sql, ...values] = tx.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(values).toEqual(["m-other", "u1"]);
    expect(sql.join("?")).toMatch(/"userId" = \?/);
    expect(sql.join("?")).toMatch(/FOR UPDATE OF m/);
    expect(tx.mediaShare.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses a clip that is still processing or has failed", async () => {
    for (const status of ["PROCESSING", "FAILED", "anything-else"]) {
      tx.$queryRaw.mockResolvedValue([{ status, isMinor: false }]);
      expect(await createShareLink("m1")).toEqual(refusal("errors.mediaNotReady"));
    }
    expect(tx.mediaShare.create).not.toHaveBeenCalled();
  });

  it("never makes a link to a file on a profile marked as a minor's", async () => {
    tx.$queryRaw.mockResolvedValue([{ status: "READY", isMinor: true }]);
    expect(await createShareLink("m1")).toEqual(refusal("errors.unauthorized"));
    expect(tx.mediaShare.create).not.toHaveBeenCalled();
  });

  it("refuses a sixth working link, counting only links that still work", async () => {
    tx.mediaShare.count.mockResolvedValue(5);
    expect(await createShareLink("m1")).toEqual(
      refusal("errors.shareLimitReached", { limit: 5 })
    );
    expect(tx.mediaShare.count).toHaveBeenCalledWith({
      where: { mediaId: "m1", revokedAt: null, expiresAt: { gt: NOW } },
    });
    expect(tx.mediaShare.create).not.toHaveBeenCalled();

    tx.mediaShare.count.mockResolvedValue(4);
    expect((await createShareLink("m1")).ok).toBe(true);
  });

  it("returns the link once, and stores only the hash of its token", async () => {
    const result = await createShareLink("m1");
    expect(result).toMatchObject({ ok: true, shareId: "s1" });
    if (!result.ok) return;

    expect(result.url).toMatch(new RegExp(`^${SITE}/api/share/[A-Za-z0-9_-]{43}$`));
    const token = result.url.slice(result.url.lastIndexOf("/") + 1);
    const { data } = tx.mediaShare.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({
      mediaId: "m1",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      createdById: "u1",
      expiresAt: new Date(NOW.getTime() + 72 * HOUR),
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(Object.keys(result).sort()).toEqual(["expiresAt", "ok", "shareId", "url"]);
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it("lasts 72 hours by default, and holds a request between 1 hour and 7 days", async () => {
    const expiry = async (hours?: number) => {
      const result = await createShareLink("m1", hours === undefined ? {} : { expiresInHours: hours });
      return result.ok ? result.expiresAt.getTime() - NOW.getTime() : null;
    };
    expect(await expiry()).toBe(72 * HOUR);
    expect(await expiry(24)).toBe(24 * HOUR);
    expect(await expiry(1)).toBe(1 * HOUR);
    expect(await expiry(0)).toBe(1 * HOUR);
    expect(await expiry(168)).toBe(168 * HOUR);
    expect(await expiry(9999)).toBe(168 * HOUR);
    // What is stored is what is returned.
    const last = tx.mediaShare.create.mock.calls.at(-1)?.[0] as { data: { expiresAt: Date } };
    expect(last.data.expiresAt.getTime() - NOW.getTime()).toBe(168 * HOUR);
  });

  it("gives two links to the same clip different tokens", async () => {
    const first = await createShareLink("m1");
    const second = await createShareLink("m1");
    expect(first.ok && second.ok && first.url !== second.url).toBe(true);
  });

  it("audits the creation with ids and the expiry, never the token or its hash", async () => {
    const result = await createShareLink("m1");
    if (!result.ok) throw new Error("expected a link");
    const token = result.url.slice(result.url.lastIndexOf("/") + 1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, string> };
    expect(data).toMatchObject({
      actorUserId: "u1",
      action: "media.share.create",
      resourceType: "MediaShare",
      resourceId: "s1",
    });
    expect(JSON.parse(data.after)).toEqual({
      mediaId: "m1",
      expiresAt: new Date(NOW.getTime() + 72 * HOUR).toISOString(),
    });
    const written = JSON.stringify(data);
    expect(written).not.toContain(token);
    expect(written).not.toContain(createHash("sha256").update(token).digest("hex"));
  });

  it("builds the link from the request when no site URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    requestHeaders = { host: "preview.agental.test", "x-forwarded-proto": "https" };
    const result = await createShareLink("m1");
    expect(result.ok && result.url.startsWith("https://preview.agental.test/api/share/")).toBe(true);
  });

  it("creates nothing when the site address cannot be known", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await createShareLink("m1")).toEqual(refusal("errors.generic"));
    expect(db.$transaction).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("revokeShareLink", () => {
  const share = { id: "s1", mediaId: "m1", revokedAt: null };

  it("is refused without a session", async () => {
    session = null;
    expect(await revokeShareLink("s1")).toEqual(refusal("errors.unauthorized"));
    expect(db.mediaShare.findFirst).not.toHaveBeenCalled();
  });

  it("answers not found for a link that is missing or on someone else's clip", async () => {
    db.mediaShare.findFirst.mockResolvedValue(null);
    expect(await revokeShareLink("s-other")).toEqual(refusal("errors.shareNotFound"));
    // Ownership runs through the clip to its profile, from the session.
    expect(db.mediaShare.findFirst.mock.calls[0][0].where).toEqual({
      id: "s-other",
      media: { profile: { userId: "u1" } },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers not found for an id that cannot be one", async () => {
    expect(await revokeShareLink("")).toEqual(refusal("errors.shareNotFound"));
    expect(await revokeShareLink(null as unknown as string)).toEqual(refusal("errors.shareNotFound"));
    expect(db.mediaShare.findFirst).not.toHaveBeenCalled();
  });

  it("stamps the link as revoked and audits it", async () => {
    db.mediaShare.findFirst.mockResolvedValue(share);
    expect(await revokeShareLink("s1")).toEqual({ ok: true });
    expect(tx.mediaShare.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", revokedAt: null },
      data: { revokedAt: NOW },
    });
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, string> };
    expect(data).toMatchObject({
      actorUserId: "u1",
      action: "media.share.revoke",
      resourceType: "MediaShare",
      resourceId: "s1",
    });
    expect(JSON.parse(data.after)).toEqual({ mediaId: "m1" });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it("succeeds without a second stamp or audit entry when already revoked", async () => {
    db.mediaShare.findFirst.mockResolvedValue({ ...share, revokedAt: new Date(NOW.getTime() - HOUR) });
    expect(await revokeShareLink("s1")).toEqual({ ok: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("writes no audit entry when another request revoked it first", async () => {
    db.mediaShare.findFirst.mockResolvedValue(share);
    tx.mediaShare.updateMany.mockResolvedValue({ count: 0 });
    expect(await revokeShareLink("s1")).toEqual({ ok: true });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
