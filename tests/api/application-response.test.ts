import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { missingParts, readSubmission } from "@/domain/application-response";

/**
 * Answering a role from Applications (round 7b, 4.2): the performer accepts,
 * answers each question, gives a clip per requested video (their own only),
 * and submits; the response is then ready for the team, and nothing else.
 */
const P = "test-appresp-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { acceptRole, saveAnswers, setSlotVideo, submitResponse } = await import("@/app/actions/application-response");
const { listSubmittedResponses } = await import("@/lib/admin/jobs");

describe("submission rules", () => {
  it("reads what a role asks for, safely", () => {
    expect(readSubmission('{"questions":["Why?"],"videos":["A monologue"]}')).toEqual({ questions: ["Why?"], videos: ["A monologue"] });
    expect(readSubmission("not json")).toEqual({ questions: [], videos: [] });
    expect(readSubmission("{}")).toEqual({ questions: [], videos: [] });
  });
  it("names what still blocks Submit", () => {
    const s = { questions: ["a", "b"], videos: ["v"] };
    expect(missingParts(s, ["x", " "], [])).toEqual([{ kind: "question", index: 1 }, { kind: "video", index: 0 }]);
    expect(missingParts(s, ["x", "y"], [0])).toEqual([]);
  });
});

describe.skipIf(!local)("response flow", () => {
  let me = "";
  let other = "";
  let draftId = "";
  let myClip = "";
  let theirClip = "";
  let briefId = "";
  beforeAll(async () => {
    const make = async (name: string) =>
      prisma.user.create({
        data: { email: `${P}${name}@test.local`, kind: "TALENT", artistProfile: { create: { stageName: name } } },
        select: { id: true, artistProfile: { select: { id: true } } },
      });
    const a = await make("me");
    const b = await make("other");
    me = a.id;
    other = b.id;
    const brief = await prisma.brief.create({
      data: {
        source: "n8n-beta-v2",
        dedupeKey: `${P}brief`,
        title: "Test feature",
        roleName: "Lead",
        submission: JSON.stringify({ questions: ["Why this role?", "Availability?"], videos: ["A monologue", "A slate"] }),
      },
    });
    briefId = brief.id;
    draftId = (await prisma.applicationDraft.create({ data: { profileId: a.artistProfile!.id, briefId, idempotencyKey: `${P}d` } })).id;
    const clip = async (profileId: string, key: string) =>
      (await prisma.media.create({ data: { profileId, type: "SELFTAPE", destination: "library", storageKey: `${P}${key}` } })).id;
    myClip = await clip(a.artistProfile!.id, "mine");
    theirClip = await clip(b.artistProfile!.id, "theirs");
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    await prisma.brief.deleteMany({ where: { id: briefId } });
    await prisma.auditLog.deleteMany({ where: { resourceId: draftId } });
  });

  it("keeps another performer out", async () => {
    session.mockResolvedValue({ user: { id: other, kind: "TALENT" } });
    expect(await acceptRole(draftId)).toMatchObject({ ok: false, error: { key: "errors.notFound" } });
  });

  it("accepts, then refuses an incomplete submit", async () => {
    session.mockResolvedValue({ user: { id: me, kind: "TALENT" } });
    expect(await submitResponse(draftId, ["a", "b"])).toMatchObject({ ok: false });
    expect(await acceptRole(draftId)).toEqual({ ok: true });
    expect((await prisma.applicationDraft.findUniqueOrThrow({ where: { id: draftId } })).status).toBe("ACCEPTED");
    expect(await saveAnswers(draftId, ["Because", ""])).toEqual({ ok: true });
    expect(await submitResponse(draftId, ["Because", "Now"])).toMatchObject({ ok: false, error: { key: "errors.responseIncomplete" } });
  });

  it("takes only the performer's own clips, one per slot", async () => {
    expect(await setSlotVideo(draftId, 0, theirClip)).toMatchObject({ ok: false, error: { key: "errors.mediaNotFound" } });
    expect(await setSlotVideo(draftId, 5, myClip)).toMatchObject({ ok: false });
    expect(await setSlotVideo(draftId, 0, myClip)).toEqual({ ok: true });
    // The same clip moved to slot 1 leaves slot 0 empty.
    expect(await setSlotVideo(draftId, 1, myClip)).toEqual({ ok: true });
    const links = await prisma.draftMedia.findMany({ where: { draftId } });
    expect(links).toEqual([expect.objectContaining({ mediaId: myClip, slot: 1 })]);
  });

  it("submits once every part is there, and the team sees it", async () => {
    const meProfile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: me } });
    const second = (await prisma.media.create({ data: { profileId: meProfile.id, type: "VIDEO", storageKey: `${P}second` } })).id;
    expect(await setSlotVideo(draftId, 0, second)).toEqual({ ok: true });
    expect(await submitResponse(draftId, ["Because", "Now"])).toEqual({ ok: true });
    const d = await prisma.applicationDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(d.status).toBe("SUBMITTED");
    expect(d.submittedAt).not.toBeNull();
    expect(JSON.parse(d.answers)).toEqual(["Because", "Now"]);
    expect((await listSubmittedResponses()).some((r) => r.id === draftId)).toBe(true);
    // Submitted is final for the performer.
    expect(await setSlotVideo(draftId, 0, myClip)).toMatchObject({ ok: false });
    expect(await submitResponse(draftId, ["x", "y"])).toMatchObject({ ok: false });
  });
});
