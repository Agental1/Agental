"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError } from "@/domain/action-result";
import {
  Answers,
  EDITABLE_STATUSES,
  missingParts,
  readSubmission,
} from "@/domain/application-response";

export type ResponseResult = { ok: true } | { ok: false; error: ActionError };

const Id = z.string().min(1).max(64);

function revalidate(draftId: string) {
  revalidatePath("/[locale]/talents/(space)/app/candidatures", "page");
  revalidatePath(`/[locale]/talents/(space)/app/candidatures/${draftId}`, "page");
  revalidatePath("/[locale]/admin/recherches", "page");
}

/** The signed-in performer's own draft, still editable, with what the role asks. */
async function ownDraft(draftId: unknown) {
  const id = Id.safeParse(draftId);
  if (!id.success) return { error: err("errors.invalidInput") } as const;
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return { error: err("errors.unauthorized") } as const;
  const draft = await prisma.applicationDraft.findFirst({
    where: { id: id.data, profile: { userId: session.user.id } },
    select: {
      id: true,
      status: true,
      profileId: true,
      answers: true,
      brief: { select: { submission: true } },
      media: { select: { slot: true } },
    },
  });
  if (!draft) return { error: err("errors.notFound") } as const;
  return { draft, userId: session.user.id } as const;
}

const editable = (status: string) => (EDITABLE_STATUSES as readonly string[]).includes(status);

/** "Accept": the performer takes the role on and opens the response form. */
export async function acceptRole(draftId: unknown): Promise<ResponseResult> {
  const own = await ownDraft(draftId);
  if ("error" in own) return { ok: false, error: own.error! };
  if (!editable(own.draft.status)) return { ok: false, error: err("errors.invalidInput") };
  const { count } = await prisma.applicationDraft.updateMany({
    // An expired or withdrawn role cannot be taken on.
    where: { id: own.draft.id, status: { in: ["DRAFT", "NEEDS_INFO"] }, brief: { status: "ACTIVE" } },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  if (count !== 1) return { ok: false, error: err("errors.invalidInput") };
  await audit({ actorUserId: own.userId, action: "application.accept", resourceType: "ApplicationDraft", resourceId: own.draft.id });
  revalidate(own.draft.id);
  return { ok: true };
}

/** Save the answers as typed (a draft of the response). */
export async function saveAnswers(draftId: unknown, answers: unknown): Promise<ResponseResult> {
  const own = await ownDraft(draftId);
  if ("error" in own) return { ok: false, error: own.error! };
  if (own.draft.status !== "ACCEPTED") return { ok: false, error: err("errors.invalidInput") };
  const parsed = Answers.safeParse(answers);
  const expected = readSubmission(own.draft.brief.submission).questions.length;
  if (!parsed.success || parsed.data.length !== expected) return { ok: false, error: err("errors.invalidInput") };
  const { count } = await prisma.applicationDraft.updateMany({
    where: { id: own.draft.id, status: "ACCEPTED" },
    data: { answers: JSON.stringify(parsed.data) },
  });
  return count === 1 ? { ok: true } : { ok: false, error: err("errors.invalidInput") };
}

/**
 * Put one of the performer's own clips in a requested video slot: a clip just
 * recorded (saved in Reel & Self-tape) or one picked from there.
 */
export async function setSlotVideo(draftId: unknown, slot: unknown, mediaId: unknown): Promise<ResponseResult> {
  const own = await ownDraft(draftId);
  if ("error" in own) return { ok: false, error: own.error! };
  if (own.draft.status !== "ACCEPTED") return { ok: false, error: err("errors.invalidInput") };
  const videos = readSubmission(own.draft.brief.submission).videos.length;
  const s = z.number().int().min(0).max(videos - 1).safeParse(slot);
  const m = Id.safeParse(mediaId);
  if (!s.success || !m.success) return { ok: false, error: err("errors.invalidInput") };
  const media = await prisma.media.findFirst({
    where: { id: m.data, profileId: own.draft.profileId, type: { in: ["SELFTAPE", "VIDEO"] }, status: "READY" },
    select: { id: true },
  });
  if (!media) return { ok: false, error: err("errors.mediaNotFound") };
  const changed = await prisma.$transaction(async (tx) => {
    // Still open, checked inside the write: a response submitted a moment ago stays as sent.
    const open = await tx.applicationDraft.updateMany({ where: { id: own.draft.id, status: "ACCEPTED" }, data: { updatedAt: new Date() } });
    if (open.count !== 1) return false;
    await tx.draftMedia.deleteMany({ where: { draftId: own.draft.id, slot: s.data } });
    await tx.draftMedia.deleteMany({ where: { draftId: own.draft.id, mediaId: media.id } });
    await tx.draftMedia.create({ data: { draftId: own.draft.id, mediaId: media.id, slot: s.data } });
    return true;
  });
  if (!changed) return { ok: false, error: err("errors.invalidInput") };
  revalidate(own.draft.id);
  return { ok: true };
}

/**
 * "Submit": every question answered and every requested video given. The
 * response is then ready for the Agental team's review. Nothing is sent to a
 * casting site.
 */
export async function submitResponse(draftId: unknown, answers: unknown): Promise<ResponseResult> {
  const own = await ownDraft(draftId);
  if ("error" in own) return { ok: false, error: own.error! };
  if (own.draft.status !== "ACCEPTED") return { ok: false, error: err("errors.invalidInput") };
  const submission = readSubmission(own.draft.brief.submission);
  const parsed = Answers.safeParse(answers);
  if (!parsed.success || parsed.data.length !== submission.questions.length) {
    return { ok: false, error: err("errors.invalidInput") };
  }
  const filled = own.draft.media.map((m) => m.slot).filter((s): s is number => s !== null);
  if (missingParts(submission, parsed.data, filled).length > 0) {
    return { ok: false, error: err("errors.responseIncomplete") };
  }
  const { count } = await prisma.applicationDraft.updateMany({
    where: { id: own.draft.id, status: "ACCEPTED" },
    data: { answers: JSON.stringify(parsed.data), status: "SUBMITTED", submittedAt: new Date() },
  });
  if (count !== 1) return { ok: false, error: err("errors.invalidInput") };
  await audit({
    actorUserId: own.userId,
    action: "application.submit",
    resourceType: "ApplicationDraft",
    resourceId: own.draft.id,
    after: { answers: parsed.data.length, videos: filled.length },
  });
  revalidate(own.draft.id);
  return { ok: true };
}

