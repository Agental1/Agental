import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Application drafts with a mocked database: who may touch a draft, which
 * clips may go on it, when it is closed, and that a review writes a decision
 * and an audit entry and nothing else. The same rules against a real
 * database are in tests/api/workflow-flow.test.ts.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };

const tx = {
  applicationDraft: { updateMany: vi.fn() },
  draftMedia: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
// Outside a transaction the actions may only read. Any other call hits a
// missing method and fails the test.
const db = {
  artistProfile: { findUnique: vi.fn() },
  applicationDraft: { findFirst: vi.fn(), findMany: vi.fn() },
  media: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const sendEmail = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/mailer", () => ({ sendEmail }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { attachMediaToDraft, detachMediaFromDraft, reviewDraft } = await import(
  "@/app/actions/drafts"
);
const { getMyDraft, listMyDrafts } = await import("@/lib/drafts");

const refused = (key: string) => ({ ok: false, error: { key } });

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "u1", kind: "TALENT" } };
  db.artistProfile.findUnique.mockResolvedValue({ id: "p1", userId: "u1" });
  db.applicationDraft.findFirst.mockResolvedValue({ id: "d1", status: "DRAFT" });
  db.media.findFirst.mockResolvedValue({ id: "m1", status: "READY" });
  tx.applicationDraft.updateMany.mockResolvedValue({ count: 1 });
  tx.draftMedia.findMany.mockResolvedValue([]);
  tx.draftMedia.create.mockResolvedValue({});
  tx.draftMedia.deleteMany.mockResolvedValue({ count: 1 });
  tx.auditLog.create.mockResolvedValue({});
});

describe("who may act on a draft", () => {
  const actions: Array<[string, () => Promise<unknown>]> = [
    ["attachMediaToDraft", () => attachMediaToDraft("d1", "m1")],
    ["detachMediaFromDraft", () => detachMediaFromDraft("d1", "m1")],
    ["reviewDraft", () => reviewDraft("d1", "approve")],
  ];

  it.each(actions)("%s needs a signed-in performer with a profile", async (_name, act) => {
    session = null;
    expect(await act()).toEqual(refused("errors.unauthorized"));
    session = { user: { id: "u1", kind: "CASTING" } };
    expect(await act()).toEqual(refused("errors.unauthorized"));
    session = { user: { id: "u1", kind: "TALENT" } };
    db.artistProfile.findUnique.mockResolvedValue(null);
    expect(await act()).toEqual(refused("errors.unauthorized"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(actions)("%s reads a draft that is not the caller's as not found", async (_name, act) => {
    db.applicationDraft.findFirst.mockResolvedValue(null);
    expect(await act()).toEqual(refused("errors.draftNotFound"));
    // The lookup is scoped to the profile taken from the session.
    expect(db.applicationDraft.findFirst.mock.calls[0][0].where).toEqual({
      id: "d1",
      profileId: "p1",
    });
    expect(db.artistProfile.findUnique.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(actions)("%s refuses an approved or declined draft", async (_name, act) => {
    for (const status of ["APPROVED", "DECLINED"]) {
      db.applicationDraft.findFirst.mockResolvedValue({ id: "d1", status });
      expect(await act()).toEqual(refused("errors.draftAlreadyReviewed"));
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(actions)("%s refuses a draft that was reviewed in the meantime", async (_name, act) => {
    tx.applicationDraft.updateMany.mockResolvedValue({ count: 0 });
    expect(await act()).toEqual(refused("errors.draftAlreadyReviewed"));
    expect(tx.draftMedia.create).not.toHaveBeenCalled();
    expect(tx.draftMedia.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses ids that are not plausible", async () => {
    expect(await attachMediaToDraft("", "m1")).toEqual(refused("errors.invalidInput"));
    expect(await attachMediaToDraft("d1", "x".repeat(65))).toEqual(refused("errors.invalidInput"));
    expect(await detachMediaFromDraft("d1", "")).toEqual(refused("errors.invalidInput"));
    expect(await reviewDraft("", "approve")).toEqual(refused("errors.invalidInput"));
    expect(db.applicationDraft.findFirst).not.toHaveBeenCalled();
  });
});

describe("attachMediaToDraft", () => {
  it("attaches a ready clip of the same profile, with an audit entry", async () => {
    expect(await attachMediaToDraft("d1", "m1")).toEqual({ ok: true });
    expect(db.media.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", profileId: "p1" });
    expect(tx.applicationDraft.updateMany.mock.calls[0][0].where).toEqual({
      id: "d1",
      profileId: "p1",
      status: { in: ["DRAFT", "NEEDS_INFO"] },
    });
    expect(tx.draftMedia.create).toHaveBeenCalledWith({ data: { draftId: "d1", mediaId: "m1" } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      actorUserId: "u1",
      action: "draft.media.attach",
      resourceType: "ApplicationDraft",
      resourceId: "d1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it("works on a draft waiting for information", async () => {
    db.applicationDraft.findFirst.mockResolvedValue({ id: "d1", status: "NEEDS_INFO" });
    expect(await attachMediaToDraft("d1", "m1")).toEqual({ ok: true });
  });

  it("reads a clip of another profile, or an unknown one, as not found", async () => {
    db.media.findFirst.mockResolvedValue(null);
    expect(await attachMediaToDraft("d1", "m-other")).toEqual(refused("errors.mediaNotFound"));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a clip that is still processing or failed", async () => {
    for (const status of ["PROCESSING", "FAILED"]) {
      db.media.findFirst.mockResolvedValue({ id: "m1", status });
      expect(await attachMediaToDraft("d1", "m1")).toEqual(refused("errors.mediaNotReady"));
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("is a success with nothing written when the clip is already attached", async () => {
    tx.draftMedia.findMany.mockResolvedValue([{ mediaId: "m1" }]);
    expect(await attachMediaToDraft("d1", "m1")).toEqual({ ok: true });
    expect(tx.draftMedia.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("stops at twelve clips", async () => {
    tx.draftMedia.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ mediaId: `other-${i}` }))
    );
    expect(await attachMediaToDraft("d1", "m1")).toEqual({
      ok: false,
      error: { key: "errors.draftMediaLimit", values: { limit: 12 } },
    });
    expect(tx.draftMedia.create).not.toHaveBeenCalled();
  });
});

describe("detachMediaFromDraft", () => {
  it("removes the clip from the draft, with an audit entry", async () => {
    expect(await detachMediaFromDraft("d1", "m1")).toEqual({ ok: true });
    expect(tx.draftMedia.deleteMany).toHaveBeenCalledWith({
      where: { draftId: "d1", mediaId: "m1" },
    });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe("draft.media.detach");
  });

  it("is a success with no audit entry when the clip was not attached", async () => {
    tx.draftMedia.deleteMany.mockResolvedValue({ count: 0 });
    expect(await detachMediaFromDraft("d1", "m-unknown")).toEqual({ ok: true });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("reviewDraft", () => {
  it.each([
    ["approve", "APPROVED"],
    ["decline", "DECLINED"],
    ["needs_info", "NEEDS_INFO"],
  ] as const)("records %s as %s", async (decision, status) => {
    expect(await reviewDraft("d1", decision, "  My reason.  ")).toEqual({ ok: true });
    const update = tx.applicationDraft.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: "d1",
      profileId: "p1",
      status: { in: ["DRAFT", "NEEDS_INFO"] },
    });
    expect(update.data).toMatchObject({
      status,
      reviewDecision: decision,
      reviewReason: "My reason.",
    });
    expect(update.data.reviewedAt).toBeInstanceOf(Date);
  });

  it("writes an audit entry that says a reason was given, without the reason", async () => {
    await reviewDraft("d1", "decline", "The dates clash with my day job at Example Corp.");
    const entry = tx.auditLog.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      actorUserId: "u1",
      action: "draft.review",
      resourceType: "ApplicationDraft",
      resourceId: "d1",
    });
    expect(JSON.parse(entry.before)).toEqual({ status: "DRAFT" });
    expect(JSON.parse(entry.after)).toEqual({ status: "DECLINED", decision: "decline", hasReason: true });
    expect(entry.after).not.toContain("Example Corp");
  });

  it("stores no reason when none is given, or when it is blank", async () => {
    await reviewDraft("d1", "approve");
    expect(tx.applicationDraft.updateMany.mock.calls[0][0].data.reviewReason).toBeNull();
    await reviewDraft("d1", "approve", "   ");
    expect(tx.applicationDraft.updateMany.mock.calls[1][0].data.reviewReason).toBeNull();
  });

  it("refuses a reason over 1000 characters and an unknown decision", async () => {
    expect(await reviewDraft("d1", "decline", "x".repeat(1001))).toEqual(refused("errors.invalidInput"));
    expect(await reviewDraft("d1", "decline", "x".repeat(1000))).toEqual({ ok: true });
    expect(
      await reviewDraft("d1", "submit" as unknown as "approve")
    ).toEqual(refused("errors.invalidInput"));
    expect(tx.applicationDraft.updateMany).toHaveBeenCalledTimes(1);
  });

  it("lets a draft waiting for information be reviewed again", async () => {
    db.applicationDraft.findFirst.mockResolvedValue({ id: "d1", status: "NEEDS_INFO" });
    expect(await reviewDraft("d1", "approve")).toEqual({ ok: true });
    expect(JSON.parse(tx.auditLog.create.mock.calls[0][0].data.before)).toEqual({ status: "NEEDS_INFO" });
  });

  it("does nothing else: one conditional update, one audit entry, no message", async () => {
    await reviewDraft("d1", "approve", "Looks right.");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.applicationDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.draftMedia.create).not.toHaveBeenCalled();
    expect(tx.draftMedia.deleteMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("reading drafts", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    status: "DRAFT",
    createdAt: new Date("2026-11-19T10:00:00Z"),
    reviewedAt: null,
    brief: {
      id: "b1",
      title: "Night Shift",
      production: "Acme Films",
      roleName: "Guard",
      location: "New York",
      startsOn: new Date("2026-12-01T00:00:00Z"),
      endsOn: null,
      expiresAt: null,
      status: "ACTIVE",
      source: "fixture",
    },
    evaluation: {
      decision: "needs_review",
      reasons: JSON.stringify(["The brief gives no closing date."]),
      unknowns: JSON.stringify([
        { rule: "brief_open", question: "Is it still open?", fields: ["brief.expiresAt"], source: "rules" },
      ]),
      rulesPassed: JSON.stringify([{ rule: "adult", fields: ["profile.isAdult"], source: "rules" }]),
      ruleFailures: "[]",
      profileEvidence: JSON.stringify([{ field: "profile.isAdult", excerpt: null, source: "rules" }]),
      briefEvidence: JSON.stringify([{ field: "brief.expiresAt", excerpt: null, source: "rules" }]),
      ruleVersion: "rules-test",
      modelVersion: null,
    },
    media: [{ media: { id: "m1", type: "SELFTAPE", title: "Take 2" } }],
    ...over,
  });

  it("lists the performer's drafts, newest first, with parsed columns", async () => {
    db.applicationDraft.findMany.mockResolvedValue([row()]);
    const drafts = await listMyDrafts("p1");
    const query = db.applicationDraft.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ profileId: "p1" });
    expect(query.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(drafts).toEqual([
      {
        id: "d1",
        status: "DRAFT",
        createdAt: new Date("2026-11-19T10:00:00Z"),
        reviewedAt: null,
        brief: row().brief,
        evaluation: {
          decision: "needs_review",
          reasons: ["The brief gives no closing date."],
          unknowns: [
            { rule: "brief_open", question: "Is it still open?", fields: ["brief.expiresAt"], source: "rules" },
          ],
          rulesPassed: [{ rule: "adult", fields: ["profile.isAdult"], source: "rules" }],
          ruleFailures: [],
          profileEvidence: [{ field: "profile.isAdult", excerpt: null, source: "rules" }],
          briefEvidence: [{ field: "brief.expiresAt", excerpt: null, source: "rules" }],
          ruleVersion: "rules-test",
          modelVersion: null,
        },
        media: [{ id: "m1", type: "SELFTAPE", title: "Take 2" }],
      },
    ]);
  });

  it("survives unreadable stored columns", async () => {
    db.applicationDraft.findMany.mockResolvedValue([
      row({
        evaluation: {
          ...row().evaluation,
          decision: "definitely",
          reasons: "{broken",
          unknowns: '{"not":"a list"}',
          rulesPassed: '[{"rule":"ok","fields":[],"source":"rules"},{"oops":1}]',
          ruleFailures: "null",
        },
      }),
      row({ id: "d2", evaluation: null, media: [] }),
    ]);
    const [first, second] = await listMyDrafts("p1");
    expect(first.evaluation).toMatchObject({
      decision: "needs_review",
      reasons: [],
      unknowns: [],
      rulesPassed: [{ rule: "ok", fields: [], source: "rules" }],
      ruleFailures: [],
    });
    expect(second.evaluation).toBeNull();
    expect(second.media).toEqual([]);
  });

  it("asks for nothing without a profile id", async () => {
    expect(await listMyDrafts("")).toEqual([]);
    expect(await getMyDraft("", "d1")).toBeNull();
    expect(await getMyDraft("p1", "")).toBeNull();
    expect(db.applicationDraft.findMany).not.toHaveBeenCalled();
    expect(db.applicationDraft.findFirst).not.toHaveBeenCalled();
  });

  it("gets one draft scoped to the profile, and null otherwise", async () => {
    db.applicationDraft.findFirst.mockResolvedValue(row());
    expect((await getMyDraft("p1", "d1"))?.id).toBe("d1");
    expect(db.applicationDraft.findFirst.mock.calls[0][0].where).toEqual({ id: "d1", profileId: "p1" });
    db.applicationDraft.findFirst.mockResolvedValue(null);
    expect(await getMyDraft("p2", "d1")).toBeNull();
  });
});
