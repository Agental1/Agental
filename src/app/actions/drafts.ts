"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError, type ErrorKey } from "@/domain/action-result";
import { cleanBlock } from "@/domain/workflow/text";

/**
 * What a performer may do with an application draft: choose the materials
 * that go with it, and record a decision.
 *
 * A decision is a record and nothing more. Approving a draft submits
 * nothing, sends no message and contacts nobody: it stores who decided what
 * and when, with an audit entry. Whatever happens next is a person's doing.
 *
 * Every action answers for the signed-in performer's own profile only. A
 * draft or a clip that belongs to someone else reads as not found.
 */

export type DraftActionResult = { ok: true } | { ok: false; error: ActionError };

/** A draft the performer can still change. */
const OPEN_STATUSES = ["DRAFT", "NEEDS_INFO"];

/** Clips one draft can carry. */
const MAX_DRAFT_MEDIA = 12;

const Id = z.string().min(1).max(64);

const ReviewInput = z.object({
  decision: z.enum(["approve", "decline", "needs_info"]),
  reason: z.string().max(1000).optional(),
});

const STATUS_FOR = {
  approve: "APPROVED",
  decline: "DECLINED",
  needs_info: "NEEDS_INFO",
} as const;

function fail(key: ErrorKey, values?: Record<string, number>): DraftActionResult {
  return { ok: false, error: err(key, values) };
}

/** The signed-in performer's profile, or null. */
async function performer() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, userId: true },
  });
}

/** The caller's draft, with the error to return when it cannot be changed. */
async function openDraft(profileId: string, draftId: string) {
  const draft = await prisma.applicationDraft.findFirst({
    where: { id: draftId, profileId },
    select: { id: true, status: true },
  });
  if (!draft) return { draft: null, error: "errors.draftNotFound" as const };
  if (!OPEN_STATUSES.includes(draft.status)) {
    return { draft: null, error: "errors.draftAlreadyReviewed" as const };
  }
  return { draft, error: null };
}

function revalidateDrafts() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

export async function attachMediaToDraft(
  draftId: string,
  mediaId: string
): Promise<DraftActionResult> {
  const me = await performer();
  if (!me) return fail("errors.unauthorized");
  if (!Id.safeParse(draftId).success || !Id.safeParse(mediaId).success) {
    return fail("errors.invalidInput");
  }

  const { draft, error } = await openDraft(me.id, draftId);
  if (!draft) return fail(error);

  const media = await prisma.media.findFirst({
    where: { id: mediaId, profileId: me.id },
    select: { id: true, status: true },
  });
  if (!media) return fail("errors.mediaNotFound");
  if (media.status !== "READY") return fail("errors.mediaNotReady");

  const outcome = await prisma.$transaction(async (tx) => {
    // Touching the row locks it and checks the status again, so a review
    // recorded at the same moment either comes first or waits.
    const stillOpen = await tx.applicationDraft.updateMany({
      where: { id: draft.id, profileId: me.id, status: { in: OPEN_STATUSES } },
      data: { updatedAt: new Date() },
    });
    if (stillOpen.count !== 1) return "reviewed" as const;
    const attached = await tx.draftMedia.findMany({
      where: { draftId: draft.id },
      select: { mediaId: true },
    });
    if (attached.some((link) => link.mediaId === media.id)) return "attached" as const;
    if (attached.length >= MAX_DRAFT_MEDIA) return "full" as const;
    await tx.draftMedia.create({ data: { draftId: draft.id, mediaId: media.id } });
    await audit(
      {
        actorUserId: me.userId,
        action: "draft.media.attach",
        resourceType: "ApplicationDraft",
        resourceId: draft.id,
        after: { mediaId: media.id },
      },
      tx
    );
    return "attached" as const;
  });

  if (outcome === "reviewed") return fail("errors.draftAlreadyReviewed");
  if (outcome === "full") return fail("errors.draftMediaLimit", { limit: MAX_DRAFT_MEDIA });
  revalidateDrafts();
  return { ok: true };
}

export async function detachMediaFromDraft(
  draftId: string,
  mediaId: string
): Promise<DraftActionResult> {
  const me = await performer();
  if (!me) return fail("errors.unauthorized");
  if (!Id.safeParse(draftId).success || !Id.safeParse(mediaId).success) {
    return fail("errors.invalidInput");
  }

  const { draft, error } = await openDraft(me.id, draftId);
  if (!draft) return fail(error);

  const outcome = await prisma.$transaction(async (tx) => {
    const stillOpen = await tx.applicationDraft.updateMany({
      where: { id: draft.id, profileId: me.id, status: { in: OPEN_STATUSES } },
      data: { updatedAt: new Date() },
    });
    if (stillOpen.count !== 1) return "reviewed" as const;
    const removed = await tx.draftMedia.deleteMany({
      where: { draftId: draft.id, mediaId },
    });
    if (removed.count > 0) {
      await audit(
        {
          actorUserId: me.userId,
          action: "draft.media.detach",
          resourceType: "ApplicationDraft",
          resourceId: draft.id,
          before: { mediaId },
        },
        tx
      );
    }
    return "detached" as const;
  });

  if (outcome === "reviewed") return fail("errors.draftAlreadyReviewed");
  // Removing a clip that was not attached is a success: the draft is in the
  // state that was asked for.
  revalidateDrafts();
  return { ok: true };
}

/**
 * Record the performer's decision on a draft.
 *
 * approve and decline are final. needs_info keeps the draft open: materials
 * can still change and it can be reviewed again.
 */
export async function reviewDraft(
  draftId: string,
  decision: "approve" | "decline" | "needs_info",
  reason?: string
): Promise<DraftActionResult> {
  const me = await performer();
  if (!me) return fail("errors.unauthorized");
  const parsed = ReviewInput.safeParse({ decision, reason });
  if (!Id.safeParse(draftId).success || !parsed.success) {
    return fail("errors.invalidInput");
  }

  const { draft, error } = await openDraft(me.id, draftId);
  if (!draft) return fail(error);

  const status = STATUS_FOR[parsed.data.decision];
  const reviewReason = parsed.data.reason ? cleanBlock(parsed.data.reason) || null : null;
  const reviewedAt = new Date();

  const recorded = await prisma.$transaction(async (tx) => {
    const updated = await tx.applicationDraft.updateMany({
      where: { id: draft.id, profileId: me.id, status: { in: OPEN_STATUSES } },
      data: {
        status,
        reviewDecision: parsed.data.decision,
        reviewReason,
        reviewedAt,
      },
    });
    if (updated.count !== 1) return false;
    // The reason stays on the draft. The audit entry says only that one was given.
    await audit(
      {
        actorUserId: me.userId,
        action: "draft.review",
        resourceType: "ApplicationDraft",
        resourceId: draft.id,
        before: { status: draft.status },
        after: {
          status,
          decision: parsed.data.decision,
          hasReason: reviewReason !== null,
        },
      },
      tx
    );
    return true;
  });

  if (!recorded) return fail("errors.draftAlreadyReviewed");
  revalidateDrafts();
  return { ok: true };
}
