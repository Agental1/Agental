import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The whole upload path against a real database and the local disk store:
 * createUpload, the file arriving, completeUpload, the listing, the access
 * rule and deleteRecording. Only the session is faked.
 *
 * Needs DATABASE_URL (a local or test database, never production) and a
 * seeded talent with a signed mandate. Skipped otherwise, so the unit suite
 * stays runnable anywhere.
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

  beforeAll(async () => {
    const { prisma } = await import("@/lib/db");
    const profile = await prisma.artistProfile.findFirst({
      where: { isMinor: false, mandat: { status: "ACTIVE", signedAt: { not: null } } },
      select: { id: true, userId: true },
    });
    if (!profile) throw new Error("Seed a talent with a signed mandate first (bun run db:seed).");
    profileId = profile.id;
    sessionUserId = profile.userId;
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.media.deleteMany({ where: { id: { in: created } } });
    await prisma.upload.deleteMany({ where: { profileId } });
  });

  it("stores a self-tape privately, lists it, and removes the file with the row", async () => {
    const { prisma } = await import("@/lib/db");
    const { getStorage } = await import("@/lib/storage");
    const { createUpload, completeUpload, deleteRecording } = await import("@/app/actions/uploads");
    const { listRecordings } = await import("@/lib/recordings");
    const { canReadMedia } = await import("@/lib/media-access");

    const bytes = Buffer.alloc(256 * 1024, 7);
    const start = await createUpload({
      type: "SELFTAPE",
      mime: "video/mp4;codecs=avc1",
      sizeBytes: bytes.length,
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
    });
    expect(media.selfTape?.status).toBe("READY");
    expect(await prisma.upload.findUnique({ where: { id: start.uploadId } })).toBeNull();

    // A second completion finds nothing pending.
    expect((await completeUpload({ uploadId: start.uploadId })).ok).toBe(false);

    const library = await listRecordings(profileId, { destination: "library" });
    const listed = library.find((r) => r.id === done.mediaId);
    expect(listed).toMatchObject({ type: "SELFTAPE", destination: "library", url: `/api/media/${done.mediaId}` });
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

    expect(await deleteRecording(done.mediaId)).toEqual({ ok: true });
    expect(await prisma.media.findUnique({ where: { id: done.mediaId } })).toBeNull();
    expect(await storage.head(pending.storageKey)).toBeNull();
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
