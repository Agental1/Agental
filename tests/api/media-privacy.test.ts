import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Media privacy against the real database: two talents, and everything one
 * of them must never be able to do to the other's files.
 *
 * The risk in these rules is the shape of the ownership queries (and, for
 * share links, a locking statement written in SQL), so a mocked Prisma would
 * only assert the mock. The session and the object store are faked; no real
 * storage is called. Every row carries a prefix and is removed in afterAll.
 *
 * Needs DATABASE_URL (a local or test database, never production). Skipped
 * otherwise, so the unit suite stays runnable anywhere. Against a
 * single-connection test server, run with DATABASE_POOL_MAX=1 and
 * --no-file-parallelism.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const P = "test-media-privacy-";
const SITE = "https://share.agental.test";
const ADDRESS = `${P}client`;
const MB = 1024 * 1024;

let sessionUserId: string | null = null;

/** An in-memory object store. Records every key it was asked to delete. */
const objects = new Map<string, { size: number; mime: string }>();
const deletedKeys: string[] = [];
const fakeStorage = {
  put: async (key: string, bytes: Buffer, mime: string) => {
    objects.set(key, { size: bytes.length, mime });
    return { key, size: bytes.length, mime };
  },
  get: async () => null,
  head: async (key: string) => objects.get(key) ?? null,
  delete: async (key: string) => {
    deletedKeys.push(key);
    objects.delete(key);
  },
  list: async (prefix: string) => [...objects.keys()].filter((key) => key.startsWith(prefix)),
  signedUrl: async (key: string) => `https://storage.test/signed/${encodeURIComponent(key)}`,
  presignUpload: async (key: string, mime: string) => ({
    url: `https://storage.test/put/${encodeURIComponent(key)}`,
    headers: { "Content-Type": mime },
  }),
};

vi.mock("@/auth", () => ({
  auth: async () => (sessionUserId ? { user: { id: sessionUserId, kind: "TALENT" } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  getStorage: async () => fakeStorage,
}));

const notFound = (key: string) => ({ ok: false, error: { key } });

describe.skipIf(!hasDb)("media privacy between two talents", () => {
  const a = { userId: "", profileId: "" };
  const b = { userId: "", profileId: "" };
  let rateKey = "";

  const as = (who: { userId: string } | null) => {
    sessionUserId = who?.userId ?? null;
  };

  async function cleanup() {
    const { prisma } = await import("@/lib/db");
    const users = await prisma.user.findMany({
      where: { email: { startsWith: P } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.brief.deleteMany({ where: { dedupeKey: { startsWith: P } } });
    // Cascades: profile, media, tapes, uploads, share links, drafts.
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    if (rateKey) await prisma.rateLimitEvent.deleteMany({ where: { key: rateKey } });
  }

  async function createTalent(name: string) {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.create({
      data: { email: `${P}${name}@test.local`, kind: "TALENT" },
    });
    // An adult talent with a profile and nothing else: uploading asks for no
    // mandate.
    const profile = await prisma.artistProfile.create({
      data: { userId: user.id, stageName: `${P}${name}` },
    });
    return { userId: user.id, profileId: profile.id };
  }

  /** createUpload, the file arriving in the fake store, completeUpload. */
  async function uploadSelfTape(options: { tapeId?: string; title?: string } = {}) {
    const { prisma } = await import("@/lib/db");
    const { createUpload, completeUpload } = await import("@/app/actions/uploads");
    const start = await createUpload({
      type: "SELFTAPE",
      mime: "video/mp4",
      sizeBytes: 2 * MB,
      consentVersion: "test-1",
      ...options,
    });
    if (!start.ok) throw new Error(`createUpload refused: ${start.error.key}`);
    const pending = await prisma.upload.findUniqueOrThrow({ where: { id: start.uploadId } });
    objects.set(pending.storageKey, { size: pending.sizeBytes, mime: pending.mime });
    const done = await completeUpload({ uploadId: start.uploadId });
    if (!done.ok) throw new Error(`completeUpload refused: ${done.error.key}`);
    if (!done.tapeId) throw new Error("a self-tape must join a tape");
    return { mediaId: done.mediaId, tapeId: done.tapeId, takeNumber: done.takeNumber, storageKey: pending.storageKey };
  }

  async function openLink(url: string) {
    const { GET } = await import("@/app/api/share/[token]/route");
    const token = url.slice(url.lastIndexOf("/") + 1);
    return GET(new Request(url, { headers: { "x-real-ip": ADDRESS } }), {
      params: Promise.resolve({ token }),
    });
  }

  async function newLink(mediaId: string, hours?: number) {
    const { createShareLink } = await import("@/app/actions/share");
    const link = await createShareLink(mediaId, hours === undefined ? {} : { expiresInHours: hours });
    if (!link.ok) throw new Error(`createShareLink refused: ${link.error.key}`);
    return link;
  }

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    const { shareRateKey } = await import("@/lib/share");
    rateKey = shareRateKey(ADDRESS);
    await cleanup();
    Object.assign(a, await createTalent("a"));
    Object.assign(b, await createTalent("b"));
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/db");
    await cleanup();
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  it("keeps a library self-tape from another talent, through the rule and through the route", async () => {
    const { canReadMedia } = await import("@/lib/media-access");
    const { GET } = await import("@/app/api/media/[id]/route");
    const { listTapes } = await import("@/lib/tapes");
    const { listRecordings } = await import("@/lib/recordings");

    as(a);
    const tape = await uploadSelfTape({ title: "A's audition" });

    expect(await canReadMedia(a.userId, a.profileId, { destination: "library" })).toBe(true);
    expect(await canReadMedia(b.userId, a.profileId, { destination: "library" })).toBe(false);
    expect(await canReadMedia(b.userId, a.profileId)).toBe(false);

    const read = (mediaId: string) =>
      GET(new Request(`${SITE}/api/media/${mediaId}`), { params: Promise.resolve({ id: mediaId }) });
    as(a);
    expect((await read(tape.mediaId)).status).toBe(302);
    as(b);
    expect((await read(tape.mediaId)).status).toBe(404);
    as(null);
    expect((await read(tape.mediaId)).status).toBe(404);

    // B's own listings never show A's tape.
    expect(await listTapes(b.profileId)).toEqual([]);
    expect(await listRecordings(b.profileId)).toEqual([]);
    const mine = await listTapes(a.profileId);
    expect(mine.map((t) => t.id)).toContain(tape.tapeId);
    expect(mine.find((t) => t.id === tape.tapeId)?.versions[0]).toMatchObject({
      id: tape.mediaId,
      status: "READY",
      tapeId: tape.tapeId,
      takeNumber: 1,
      title: "A's audition",
      destination: "library",
    });
  });

  it("refuses B a share link to A's clip, and refuses B the right to revoke A's link", async () => {
    const { prisma } = await import("@/lib/db");
    const { createShareLink, revokeShareLink } = await import("@/app/actions/share");
    const { listShareLinks } = await import("@/lib/share");

    as(a);
    const tape = await uploadSelfTape();
    const link = await newLink(tape.mediaId);

    as(b);
    // Same answer as for a clip that does not exist.
    expect(await createShareLink(tape.mediaId)).toEqual(notFound("errors.mediaNotFound"));
    expect(await createShareLink("no-such-media")).toEqual(notFound("errors.mediaNotFound"));
    expect(await revokeShareLink(link.shareId)).toEqual(notFound("errors.shareNotFound"));
    expect(await revokeShareLink("no-such-share")).toEqual(notFound("errors.shareNotFound"));
    as(null);
    expect(await createShareLink(tape.mediaId)).toEqual(notFound("errors.unauthorized"));
    expect(await revokeShareLink(link.shareId)).toEqual(notFound("errors.unauthorized"));

    // The state is as A left it: one link, still working, made by A.
    const rows = await prisma.mediaShare.findMany({ where: { mediaId: tape.mediaId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: link.shareId, createdById: a.userId, revokedAt: null });
    expect((await openLink(link.url)).status).toBe(302);

    // Scoped to B's profile, the listing of A's clip is empty.
    expect(await listShareLinks(tape.mediaId, { profileId: b.profileId })).toEqual([]);
    expect(await listShareLinks(tape.mediaId, { profileId: a.profileId })).toHaveLength(1);
  });

  it("refuses B to rename or delete A's tape", async () => {
    const { prisma } = await import("@/lib/db");
    const { renameTape, deleteTape } = await import("@/app/actions/tapes");

    as(a);
    const tape = await uploadSelfTape({ title: "Keep this name" });

    as(b);
    expect(await renameTape(tape.tapeId, { title: "Taken over" })).toEqual(notFound("errors.tapeNotFound"));
    expect(await deleteTape(tape.tapeId)).toEqual(notFound("errors.tapeNotFound"));
    expect(await deleteTape("no-such-tape")).toEqual(notFound("errors.tapeNotFound"));
    as(null);
    expect(await renameTape(tape.tapeId, { title: "Taken over" })).toEqual(notFound("errors.unauthorized"));
    expect(await deleteTape(tape.tapeId)).toEqual(notFound("errors.unauthorized"));

    expect(await prisma.tape.findUnique({ where: { id: tape.tapeId } })).toMatchObject({
      profileId: a.profileId,
      title: "Keep this name",
    });
    expect(await prisma.media.findUnique({ where: { id: tape.mediaId } })).not.toBeNull();
    expect(objects.has(tape.storageKey)).toBe(true);

    // The owner can.
    as(a);
    expect(await renameTape(tape.tapeId, { title: " Renamed ", demoBrief: "To camera." })).toEqual({ ok: true });
    expect(await prisma.tape.findUnique({ where: { id: tape.tapeId } })).toMatchObject({
      title: "Renamed",
      demoBrief: "To camera.",
    });
  });

  it("refuses B a new version on A's tape, and A's pending upload", async () => {
    const { prisma } = await import("@/lib/db");
    const { createUpload, completeUpload } = await import("@/app/actions/uploads");

    as(a);
    const tape = await uploadSelfTape();
    const pendingOfA = await createUpload({ type: "SELFTAPE", mime: "video/mp4", sizeBytes: MB, tapeId: tape.tapeId });
    expect(pendingOfA.ok).toBe(true);
    if (!pendingOfA.ok) return;

    as(b);
    const before = await prisma.upload.count({ where: { profileId: b.profileId } });
    expect(
      await createUpload({ type: "SELFTAPE", mime: "video/mp4", sizeBytes: MB, tapeId: tape.tapeId })
    ).toEqual(notFound("errors.tapeNotFound"));
    expect(
      await createUpload({ type: "SELFTAPE", mime: "video/mp4", sizeBytes: MB, tapeId: "no-such-tape" })
    ).toEqual(notFound("errors.tapeNotFound"));
    expect(await prisma.upload.count({ where: { profileId: b.profileId } })).toBe(before);
    // B cannot finish A's upload either.
    expect(await completeUpload({ uploadId: pendingOfA.uploadId })).toEqual(notFound("errors.uploadNotFound"));

    // A's tape has exactly the one version A made.
    expect(await prisma.selfTape.count({ where: { tapeId: tape.tapeId } })).toBe(1);

    // A's own second version joins the tape as version 2.
    as(a);
    const second = await uploadSelfTape({ tapeId: tape.tapeId });
    expect(second).toMatchObject({ tapeId: tape.tapeId, takeNumber: 2 });
    // B's own upload starts B's own tape.
    as(b);
    const own = await uploadSelfTape();
    expect(own.tapeId).not.toBe(tape.tapeId);
    expect(await prisma.tape.findUnique({ where: { id: own.tapeId } })).toMatchObject({
      profileId: b.profileId,
      title: "",
    });
  });

  it("opens a share link until it is revoked, then answers 404", async () => {
    const { prisma } = await import("@/lib/db");
    const { revokeShareLink } = await import("@/app/actions/share");
    const { listShareLinks } = await import("@/lib/share");

    as(a);
    const tape = await uploadSelfTape();
    const link = await newLink(tape.mediaId);
    expect(link.url).toMatch(new RegExp(`^${SITE}/api/share/[A-Za-z0-9_-]{43}$`));
    const token = link.url.slice(link.url.lastIndexOf("/") + 1);

    // The database holds the hash of the token and nothing that contains it.
    const row = await prisma.mediaShare.findUniqueOrThrow({ where: { id: link.shareId } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(71 * 60 * 60 * 1000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThan(73 * 60 * 60 * 1000);

    // Opened with no session at all.
    as(null);
    const opened = await openLink(link.url);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toBe(
      `https://storage.test/signed/${encodeURIComponent(tape.storageKey)}`
    );
    expect(opened.headers.get("cache-control")).toBe("no-store");
    expect(opened.headers.get("referrer-policy")).toBe("no-referrer");
    expect(opened.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    await openLink(link.url);

    as(a);
    expect(await listShareLinks(tape.mediaId)).toEqual([
      expect.objectContaining({ id: link.shareId, viewCount: 2, active: true, revokedAt: null }),
    ]);
    expect((await listShareLinks(tape.mediaId))[0].lastViewedAt).toBeInstanceOf(Date);

    expect(await revokeShareLink(link.shareId)).toEqual({ ok: true });
    as(null);
    const refused = await openLink(link.url);
    expect(refused.status).toBe(404);
    expect(refused.headers.get("location")).toBeNull();
    // The same answer as a link that never existed.
    const unknown = await openLink(`${SITE}/api/share/${"A".repeat(43)}`);
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe(await refused.text());

    as(a);
    const [listed] = await listShareLinks(tape.mediaId);
    expect(listed).toMatchObject({ active: false, viewCount: 2 });
    expect(listed.revokedAt).toBeInstanceOf(Date);
    // Revoking again succeeds and changes nothing.
    expect(await revokeShareLink(link.shareId)).toEqual({ ok: true });

    // Both steps were audited, without the token or its hash.
    const entries = await prisma.auditLog.findMany({ where: { resourceId: link.shareId } });
    expect(entries.map((entry) => entry.action).sort()).toEqual(["media.share.create", "media.share.revoke"]);
    const written = JSON.stringify(entries);
    expect(written).not.toContain(token);
    expect(written).not.toContain(row.tokenHash);
  });

  it("answers 404 for an expired link, and stops counting it against the limit", async () => {
    const { prisma } = await import("@/lib/db");
    const { createShareLink } = await import("@/app/actions/share");
    const { listShareLinks } = await import("@/lib/share");

    as(a);
    const tape = await uploadSelfTape();
    const links: Array<{ shareId: string; url: string }> = [];
    for (let i = 0; i < 5; i += 1) links.push(await newLink(tape.mediaId, 1));

    // Five links work at once; a sixth is refused.
    expect(await createShareLink(tape.mediaId)).toEqual({
      ok: false,
      error: { key: "errors.shareLimitReached", values: { limit: 5 } },
    });
    expect(await prisma.mediaShare.count({ where: { mediaId: tape.mediaId } })).toBe(5);

    // Time passes for the first link.
    await prisma.mediaShare.update({
      where: { id: links[0].shareId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    as(null);
    expect((await openLink(links[0].url)).status).toBe(404);
    expect((await openLink(links[1].url)).status).toBe(302);

    as(a);
    const listed = await listShareLinks(tape.mediaId);
    expect(listed.filter((link) => link.active)).toHaveLength(4);
    expect(listed.find((link) => link.id === links[0].shareId)).toMatchObject({ active: false, viewCount: 0 });

    // The expired link freed a place.
    expect((await createShareLink(tape.mediaId, { expiresInHours: 9999 })).ok).toBe(true);
    expect((await createShareLink(tape.mediaId)).ok).toBe(false);
    // The longest a link can last is seven days.
    const longest = await prisma.mediaShare.findFirstOrThrow({
      where: { mediaId: tape.mediaId },
      orderBy: { expiresAt: "desc" },
    });
    const lifetime = longest.expiresAt.getTime() - longest.createdAt.getTime();
    expect(Math.round(lifetime / (60 * 60 * 1000))).toBe(168);
  });

  it("refuses to share a clip that is processing or failed, and closes its links meanwhile", async () => {
    const { prisma } = await import("@/lib/db");
    const { createShareLink } = await import("@/app/actions/share");

    as(a);
    const tape = await uploadSelfTape();
    const link = await newLink(tape.mediaId);

    for (const status of ["PROCESSING", "FAILED"]) {
      await prisma.media.update({ where: { id: tape.mediaId }, data: { status } });
      expect(await createShareLink(tape.mediaId)).toEqual(notFound("errors.mediaNotReady"));
      expect((await openLink(link.url)).status).toBe(404);
    }
    expect(await prisma.mediaShare.count({ where: { mediaId: tape.mediaId } })).toBe(1);

    await prisma.media.update({ where: { id: tape.mediaId }, data: { status: "READY" } });
    expect((await openLink(link.url)).status).toBe(302);
    expect((await createShareLink(tape.mediaId)).ok).toBe(true);
  });

  it("deleting a clip removes its rows, its file, its links and its place in a draft", async () => {
    const { prisma } = await import("@/lib/db");
    const { deleteRecording } = await import("@/app/actions/uploads");

    as(a);
    const tape = await uploadSelfTape({ title: "To delete" });
    const link = await newLink(tape.mediaId);
    const brief = await prisma.brief.create({
      data: { source: "fixture", dedupeKey: `${P}brief-1`, title: `${P}brief` },
    });
    const draft = await prisma.applicationDraft.create({
      data: {
        profileId: a.profileId,
        briefId: brief.id,
        idempotencyKey: `${P}draft-1`,
        media: { create: { mediaId: tape.mediaId } },
      },
    });
    expect(await prisma.draftMedia.count({ where: { mediaId: tape.mediaId } })).toBe(1);
    expect((await openLink(link.url)).status).toBe(302);

    // B cannot delete it.
    as(b);
    expect(await deleteRecording(tape.mediaId)).toEqual(notFound("errors.mediaNotFound"));
    expect(await prisma.media.findUnique({ where: { id: tape.mediaId } })).not.toBeNull();

    as(a);
    expect(await deleteRecording(tape.mediaId)).toEqual({ ok: true });

    expect(await prisma.media.findUnique({ where: { id: tape.mediaId } })).toBeNull();
    expect(await prisma.selfTape.count({ where: { mediaId: tape.mediaId } })).toBe(0);
    expect(await prisma.mediaShare.count({ where: { mediaId: tape.mediaId } })).toBe(0);
    expect(await prisma.draftMedia.count({ where: { mediaId: tape.mediaId } })).toBe(0);
    expect(objects.has(tape.storageKey)).toBe(false);
    expect(deletedKeys).toContain(tape.storageKey);
    as(null);
    expect((await openLink(link.url)).status).toBe(404);

    // The draft itself and the now empty tape are still there.
    expect(await prisma.applicationDraft.findUnique({ where: { id: draft.id } })).not.toBeNull();
    expect(await prisma.tape.findUnique({ where: { id: tape.tapeId } })).toMatchObject({ title: "To delete" });
    const entry = await prisma.auditLog.findFirst({ where: { resourceId: tape.mediaId, action: "media.delete" } });
    expect(entry?.actorUserId).toBe(a.userId);
    expect(JSON.stringify(entry)).not.toContain(tape.storageKey);
  });

  it("deleting a tape removes every version, their files and their links, with one audit entry", async () => {
    const { prisma } = await import("@/lib/db");
    const { deleteTape } = await import("@/app/actions/tapes");
    const { createUpload, completeUpload } = await import("@/app/actions/uploads");
    const { listTapes } = await import("@/lib/tapes");

    as(a);
    const first = await uploadSelfTape({ title: "Two versions" });
    const second = await uploadSelfTape({ tapeId: first.tapeId });
    const other = await uploadSelfTape({ title: "Another tape" });
    const linkOne = await newLink(first.mediaId);
    const linkTwo = await newLink(second.mediaId);
    const linkOther = await newLink(other.mediaId);
    // A third version still on its way when the tape is deleted.
    const late = await createUpload({ type: "SELFTAPE", mime: "video/mp4", sizeBytes: MB, tapeId: first.tapeId });
    if (!late.ok) throw new Error("expected a pending upload");
    const latePending = await prisma.upload.findUniqueOrThrow({ where: { id: late.uploadId } });
    objects.set(latePending.storageKey, { size: latePending.sizeBytes, mime: latePending.mime });

    const tape = (await listTapes(a.profileId)).find((t) => t.id === first.tapeId);
    expect(tape?.versions.map((v) => v.id)).toEqual([second.mediaId, first.mediaId]);

    expect(await deleteTape(first.tapeId)).toEqual({ ok: true });

    expect(await prisma.tape.findUnique({ where: { id: first.tapeId } })).toBeNull();
    expect(await prisma.media.count({ where: { id: { in: [first.mediaId, second.mediaId] } } })).toBe(0);
    expect(await prisma.selfTape.count({ where: { mediaId: { in: [first.mediaId, second.mediaId] } } })).toBe(0);
    expect(await prisma.mediaShare.count({ where: { mediaId: { in: [first.mediaId, second.mediaId] } } })).toBe(0);
    expect(await prisma.upload.findUnique({ where: { id: late.uploadId } })).toBeNull();
    for (const key of [first.storageKey, second.storageKey, latePending.storageKey]) {
      expect(objects.has(key)).toBe(false);
    }
    // The late version cannot be completed any more.
    expect(await completeUpload({ uploadId: late.uploadId })).toEqual(notFound("errors.uploadNotFound"));

    as(null);
    expect((await openLink(linkOne.url)).status).toBe(404);
    expect((await openLink(linkTwo.url)).status).toBe(404);
    // The other tape is untouched.
    expect((await openLink(linkOther.url)).status).toBe(302);
    expect(await prisma.media.findUnique({ where: { id: other.mediaId } })).not.toBeNull();
    expect(objects.has(other.storageKey)).toBe(true);

    const entries = await prisma.auditLog.findMany({ where: { resourceId: first.tapeId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "tape.delete", actorUserId: a.userId, resourceType: "Tape" });
    expect(JSON.parse(entries[0].before)).toMatchObject({ versions: 2, shareLinks: 2, pendingUploads: 1 });
    expect(entries[0].before).not.toContain("selftape/");
  });

  it("stores the client address of a link's visitors only as a keyed hash", async () => {
    const { prisma } = await import("@/lib/db");
    const events = await prisma.rateLimitEvent.findMany({ where: { key: rateKey } });
    expect(events.length).toBeGreaterThan(0);
    expect(rateKey).not.toContain(ADDRESS);
    expect(await prisma.rateLimitEvent.count({ where: { key: { contains: ADDRESS } } })).toBe(0);
  });
});
