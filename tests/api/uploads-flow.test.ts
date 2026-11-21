import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The whole upload path against a real database and the local disk store:
 * createUpload, the file arriving, completeUpload, the listing, the access
 * rule and deleteRecording, then a second version on the same tape and
 * deleteTape. Only the session is faked.
 *
 * Needs DATABASE_URL (a local or test database, never production) and a
 * seeded adult talent. Skipped otherwise, so the unit suite stays runnable
 * anywhere.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
let sessionUserId = "";

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: sessionUserId, kind: "TALENT" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe.skipIf(!hasDb)("direct upload, end to end", () => {
  let profileId = "";
  const created: string[] = [];
  const tapes: string[] = [];

  beforeAll(async () => {
    const { prisma } = await import("@/lib/db");
    const profile = await prisma.artistProfile.findFirst({
      where: { isMinor: false, user: { kind: "TALENT" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });
    if (!profile) throw new Error("Seed an adult talent first (bun run db:seed).");
    profileId = profile.id;
    sessionUserId = profile.userId;
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.media.deleteMany({ where: { id: { in: created } } });
    await prisma.tape.deleteMany({ where: { id: { in: tapes } } });
    await prisma.upload.deleteMany({ where: { profileId } });
    await prisma.auditLog.deleteMany({
      where: { resourceId: { in: [...created, ...tapes] } },
    });
  });

  it("stores a self-tape privately, lists it, and removes the file with the row", async () => {
    const { prisma } = await import("@/lib/db");
    const { getStorage } = await import("@/lib/storage");
    const { createUpload, completeUpload, deleteRecording } = await import("@/app/actions/uploads");
    const { deleteTape } = await import("@/app/actions/tapes");
    const { listRecordings } = await import("@/lib/recordings");
    const { listTapes } = await import("@/lib/tapes");
    const { canReadMedia } = await import("@/lib/media-access");

    const bytes = Buffer.alloc(256 * 1024, 7);
    const start = await createUpload({
      type: "SELFTAPE",
      mime: "video/mp4;codecs=avc1",
      sizeBytes: bytes.length,
      title: "  Flow test tape ",
      demoBrief: "Thirty seconds, to camera.",
      consentVersion: "test-1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    // Local disk cannot sign uploads, so the address is our development route.
    expect(start.url).toBe(`/api/uploads/${start.uploadId}`);

    // Completing before the file exists reports a failed transfer.
    expect(await completeUpload({ uploadId: start.uploadId })).toEqual({
      ok: false,
      error: { key: "errors.uploadFailed" },
    });

    // The browser's PUT, done here by writing where the route would write.
    const pending = await prisma.upload.findUniqueOrThrow({ where: { id: start.uploadId } });
    const storage = await getStorage();
    await storage.put(pending.storageKey, bytes, pending.mime);

    const done = await completeUpload({
      uploadId: start.uploadId,
      durationSec: 12,
      metrics: { framing: 0.9, light: 0.7, sound: 0.8, durationMs: 12000 },
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    created.push(done.mediaId);
    // The upload named no tape, so the file started one and is its version 1.
    expect(done.takeNumber).toBe(1);
    expect(typeof done.tapeId).toBe("string");
    const tapeId = done.tapeId ?? "";
    tapes.push(tapeId);

    const media = await prisma.media.findUniqueOrThrow({
      where: { id: done.mediaId },
      include: { selfTape: true },
    });
    expect(media).toMatchObject({
      profileId,
      type: "SELFTAPE",
      destination: "library",
      mime: "video/mp4",
      sizeBytes: bytes.length,
      durationSec: 12,
      status: "READY",
      title: "Flow test tape",
      consentVersion: "test-1",
    });
    expect(media.selfTape?.status).toBe("READY");
    expect(media.selfTape).toMatchObject({ tapeId, takeNumber: 1 });
    expect(await prisma.tape.findUniqueOrThrow({ where: { id: tapeId } })).toMatchObject({
      profileId,
      title: "Flow test tape",
      demoBrief: "Thirty seconds, to camera.",
    });
    expect(await prisma.upload.findUnique({ where: { id: start.uploadId } })).toBeNull();

    // A second completion finds nothing pending.
    expect((await completeUpload({ uploadId: start.uploadId })).ok).toBe(false);

    const library = await listRecordings(profileId, { destination: "library" });
    const listed = library.find((r) => r.id === done.mediaId);
    expect(listed).toMatchObject({
      type: "SELFTAPE",
      destination: "library",
      url: `/api/media/${done.mediaId}`,
      status: "READY",
      title: "Flow test tape",
      tapeId,
      takeNumber: 1,
    });
    expect((await listRecordings(profileId, { destination: "profile" })).some((r) => r.id === done.mediaId)).toBe(false);

    // Private: the owner reads it; a casting user with a candidature on this
    // profile does not, because it sits in the library.
    expect(await canReadMedia(sessionUserId, profileId, { destination: "library" })).toBe(true);
    const insider = await prisma.user.findFirst({
      where: {
        isAdmin: false,
        memberships: {
          some: { organization: { projects: { some: { candidatures: { some: { artistProfileId: profileId } } } } } },
        },
      },
      select: { id: true },
    });
    if (insider) {
      expect(await canReadMedia(insider.id, profileId, { destination: "library" })).toBe(false);
      expect(await canReadMedia(insider.id, profileId, { destination: "profile" })).toBe(true);
    }

    // A second file sent to the same tape becomes its version 2.
    const again = await createUpload({
      type: "SELFTAPE",
      mime: "video/mp4",
      sizeBytes: bytes.length,
      tapeId,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const pendingAgain = await prisma.upload.findUniqueOrThrow({ where: { id: again.uploadId } });
    expect(pendingAgain.tapeId).toBe(tapeId);
    await storage.put(pendingAgain.storageKey, bytes, pendingAgain.mime);
    const second = await completeUpload({ uploadId: again.uploadId });
    expect(second).toMatchObject({ ok: true, tapeId, takeNumber: 2 });
    if (!second.ok) return;
    created.push(second.mediaId);

    const tape = (await listTapes(profileId)).find((t) => t.id === tapeId);
    expect(tape).toMatchObject({ title: "Flow test tape", demoBrief: "Thirty seconds, to camera." });
    // Newest version first.
    expect(tape?.versions.map((v) => v.takeNumber)).toEqual([2, 1]);
    expect(tape?.versions.map((v) => v.id)).toEqual([second.mediaId, done.mediaId]);

    expect(await deleteRecording(done.mediaId)).toEqual({ ok: true });
    expect(await prisma.media.findUnique({ where: { id: done.mediaId } })).toBeNull();
    expect(await storage.head(pending.storageKey)).toBeNull();
    // The tape keeps its other version.
    expect((await listTapes(profileId)).find((t) => t.id === tapeId)?.versions.map((v) => v.id)).toEqual([
      second.mediaId,
    ]);

    // Deleting the tape removes what is left of it, rows and file.
    expect(await deleteTape(tapeId)).toEqual({ ok: true });
    expect(await prisma.tape.findUnique({ where: { id: tapeId } })).toBeNull();
    expect(await prisma.media.findUnique({ where: { id: second.mediaId } })).toBeNull();
    expect(await storage.head(pendingAgain.storageKey)).toBeNull();
    expect(await deleteTape(tapeId)).toEqual({ ok: false, error: { key: "errors.tapeNotFound" } });
  });

  it("refuses an oversized declaration without creating anything", async () => {
    const { prisma } = await import("@/lib/db");
    const { createUpload } = await import("@/app/actions/uploads");
    const before = await prisma.upload.count({ where: { profileId } });
    const result = await createUpload({ type: "PHOTO", mime: "image/png", sizeBytes: 16 * 1024 * 1024 });
    expect(result).toEqual({ ok: false, error: { key: "errors.uploadTooLarge", values: { limit: 15 } } });
    expect(await prisma.upload.count({ where: { profileId } })).toBe(before);
  });
});
