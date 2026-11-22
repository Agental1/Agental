"use server";

import { tapeUsedInSubmittedResponse } from "@/lib/media-locks";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { recomputeCompleteness } from "@/lib/completeness";
import { err, type ActionError } from "@/domain/action-result";
import { RenameTapeInput } from "@/domain/uploads";

/**
 * Rename and delete a self-tape (a tape and its versions). Owner only.
 *
 * The owner is read from the session. A tape that belongs to someone else
 * gets the same answer as a tape that does not exist. Only ownership is
 * asked for, so a talent can always tidy and delete their own files.
 */

export type TapeActionResult = { ok: true } | { ok: false; error: ActionError };

type OwnTape =
  | { ok: true; userId: string; tape: { id: string; profileId: string } }
  | { ok: false; error: ActionError };

/** Thrown inside the delete transaction when the tape went away first. */
class TapeGone extends Error {}

/** The error's class and, for Prisma, its code. Its message stays out. */
function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name} ${code}` : error.name;
}

async function ownTape(tapeId: unknown): Promise<OwnTape> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  if (typeof tapeId !== "string" || tapeId.length === 0 || tapeId.length > 100) {
    return { ok: false, error: err("errors.tapeNotFound") };
  }
  const tape = await prisma.tape.findFirst({
    where: { id: tapeId, profile: { userId } },
    select: { id: true, profileId: true },
  });
  if (!tape) return { ok: false, error: err("errors.tapeNotFound") };
  return { ok: true, userId, tape };
}

function revalidateMediaPages() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

/**
 * Change a tape's title and, when given, its demo brief.
 *
 * `title` is trimmed, 120 characters at most; an empty title means untitled.
 * `demoBrief` left out keeps the current brief; null or an empty string
 * clears it. The files and their own titles are untouched.
 */
export async function renameTape(
  tapeId: string,
  input: { title: string; demoBrief?: string | null }
): Promise<TapeActionResult> {
  const owned = await ownTape(tapeId);
  if (!owned.ok) return owned;

  const parsed = RenameTapeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const { title, demoBrief } = parsed.data;

  const changed = await prisma.tape.updateMany({
    where: { id: owned.tape.id, profileId: owned.tape.profileId },
    data: { title, ...(demoBrief === undefined ? {} : { demoBrief }) },
  });
  if (changed.count === 0) return { ok: false, error: err("errors.tapeNotFound") };

  revalidateMediaPages();
  return { ok: true };
}

/**
 * Delete a tape and every version of it.
 *
 * In one transaction: the Media rows of all versions (the database removes
 * their self-tape records, their share links and their places in application
 * drafts with them), any upload still on its way to this tape, the tape, and
 * one audit entry. Then the stored files, best effort: a file that could not
 * be removed is logged by its record id and left for a sweep, never the
 * other way round.
 *
 * Touching the tape row first locks it, so a version finishing its upload at
 * the same moment waits, then finds the tape gone and is discarded
 * (completeUpload answers "errors.tapeNotFound").
 */
export async function deleteTape(tapeId: string): Promise<TapeActionResult> {
  const owned = await ownTape(tapeId);
  if (!owned.ok) return owned;
  const { userId, tape } = owned;
  const now = new Date();
  if (await tapeUsedInSubmittedResponse(tape.id)) return { ok: false, error: err("errors.mediaInResponse") };

  let storageKeys: string[];
  try {
    storageKeys = await prisma.$transaction(async (tx) => {
      const locked = await tx.tape.updateMany({
        where: { id: tape.id, profileId: tape.profileId },
        data: { updatedAt: now },
      });
      if (locked.count === 0) throw new TapeGone();

      const takes = await tx.selfTape.findMany({
        where: { tapeId: tape.id, media: { profileId: tape.profileId } },
        select: { media: { select: { id: true, storageKey: true } } },
      });
      const pending = await tx.upload.findMany({
        where: { tapeId: tape.id, profileId: tape.profileId },
        select: { id: true, storageKey: true },
      });
      const mediaIds = takes.map((take) => take.media.id);

      let shareLinks = 0;
      if (mediaIds.length > 0) {
        shareLinks = await tx.mediaShare.count({
          where: { mediaId: { in: mediaIds } },
        });
        await tx.media.deleteMany({
          where: { id: { in: mediaIds }, profileId: tape.profileId },
        });
      }
      if (pending.length > 0) {
        await tx.upload.deleteMany({
          where: { id: { in: pending.map((upload) => upload.id) } },
        });
      }
      await tx.tape.delete({ where: { id: tape.id } });

      await audit(
        {
          actorUserId: userId,
          action: "tape.delete",
          resourceType: "Tape",
          resourceId: tape.id,
          // Record ids and counts only: no title, no brief, no storage key.
          before: {
            mediaIds,
            versions: mediaIds.length,
            shareLinks,
            pendingUploads: pending.length,
          },
        },
        tx
      );

      return [
        ...takes.map((take) => take.media.storageKey),
        ...pending.map((upload) => upload.storageKey),
      ];
    });
  } catch (error) {
    if (error instanceof TapeGone) {
      return { ok: false, error: err("errors.tapeNotFound") };
    }
    throw error;
  }

  // The rows are gone; now the files. A failure here must not undo a
  // deletion the person asked for.
  let notRemoved = 0;
  try {
    const storage = await getStorage();
    for (const key of storageKeys) {
      try {
        await storage.delete(key);
      } catch {
        notRemoved += 1;
      }
    }
  } catch (error) {
    notRemoved = storageKeys.length;
    console.error("[tapes] storage unavailable", errorLabel(error));
  }
  if (notRemoved > 0) {
    console.error("[tapes] stored objects not removed, left for the sweep", {
      tapeId: tape.id,
      count: notRemoved,
    });
  }

  await recomputeCompleteness(tape.profileId);
  revalidateMediaPages();
  return { ok: true };
}
