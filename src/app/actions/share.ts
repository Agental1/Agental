"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { siteBaseUrl } from "@/lib/email-tokens";
import { hashShareToken, newShareToken, shareUrl } from "@/lib/share";
import { err, type ActionError } from "@/domain/action-result";
import {
  CreateShareLinkInput,
  SHARE_MAX_ACTIVE,
  shareExpiry,
} from "@/domain/share";

/**
 * Share links: the talent's deliberate way to show one clip to someone
 * outside the product, for a limited time. Owner only.
 *
 * The owner is read from the session, never from an argument. A clip that
 * belongs to someone else gets the same answer as a clip that does not
 * exist. The link is returned once, by createShareLink; the database keeps
 * only a hash of its token, so it cannot be shown again later.
 */

export type CreateShareLinkResult =
  | { ok: true; shareId: string; url: string; expiresAt: Date }
  | { ok: false; error: ActionError };

export type RevokeShareLinkResult = { ok: true } | { ok: false; error: ActionError };

type Refusal = { refused: ActionError };

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

/** The site origin for the link, or null (logged) when it cannot be known. */
async function siteOrigin(): Promise<string | null> {
  try {
    return siteBaseUrl(process.env, await headers());
  } catch (error) {
    // siteBaseUrl's own messages name a variable and never quote a value.
    console.error(
      "[share]",
      error instanceof Error ? error.message : "the site URL is unknown"
    );
    return null;
  }
}

function revalidateMediaPages() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

/**
 * Create a link to one of the caller's own clips.
 *
 * `expiresInHours` defaults to 72 and is held between 1 and 168 (seven
 * days). A clip can have five links working at once; a sixth is refused
 * until one is revoked or runs out. The clip must be READY.
 *
 * The clip's row is locked while the links are counted and the new one is
 * written, so two requests sent together cannot both take the fifth place.
 * The same statement checks the owner, which keeps the lock off other
 * people's rows.
 */
export async function createShareLink(
  mediaId: string,
  options: { expiresInHours?: number } = {}
): Promise<CreateShareLinkResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  if (!validId(mediaId)) return { ok: false, error: err("errors.mediaNotFound") };
  const parsed = CreateShareLinkInput.safeParse(options ?? {});
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };

  // Before anything is written: a link nobody can be given must not exist.
  const origin = await siteOrigin();
  if (!origin) return { ok: false, error: err("errors.generic") };

  const now = new Date();
  const expiresAt = shareExpiry(now, parsed.data.expiresInHours);
  const token = newShareToken();

  const outcome = await prisma.$transaction(
    async (tx): Promise<{ shareId: string } | Refusal> => {
      const owned = await tx.$queryRaw<Array<{ status: string; isMinor: boolean }>>`
        SELECT m."status", p."isMinor"
        FROM "Media" m
        JOIN "ArtistProfile" p ON p."id" = m."profileId"
        WHERE m."id" = ${mediaId} AND p."userId" = ${userId}
        FOR UPDATE OF m`;
      const media = owned[0];
      if (!media) return { refused: err("errors.mediaNotFound") };
      // V1 stores no minor's image. Should a profile be marked as a minor's
      // later, its files never leave the product through a link.
      if (media.isMinor) return { refused: err("errors.unauthorized") };
      if (media.status !== "READY") return { refused: err("errors.mediaNotReady") };

      const active = await tx.mediaShare.count({
        where: { mediaId, revokedAt: null, expiresAt: { gt: now } },
      });
      if (active >= SHARE_MAX_ACTIVE) {
        return {
          refused: err("errors.shareLimitReached", { limit: SHARE_MAX_ACTIVE }),
        };
      }

      const share = await tx.mediaShare.create({
        data: {
          mediaId,
          tokenHash: hashShareToken(token),
          createdById: userId,
          expiresAt,
        },
        select: { id: true },
      });
      await audit(
        {
          actorUserId: userId,
          action: "media.share.create",
          resourceType: "MediaShare",
          resourceId: share.id,
          // Ids and the expiry only. The token and its hash stay out.
          after: { mediaId, expiresAt: expiresAt.toISOString() },
        },
        tx
      );
      return { shareId: share.id };
    }
  );
  if ("refused" in outcome) return { ok: false, error: outcome.refused };

  revalidateMediaPages();
  return {
    ok: true,
    shareId: outcome.shareId,
    url: shareUrl(origin, token),
    expiresAt,
  };
}

/**
 * Stop a link from working, at once and for good. Revoking a link that was
 * already revoked or has expired succeeds and changes nothing.
 */
export async function revokeShareLink(shareId: string): Promise<RevokeShareLinkResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: err("errors.unauthorized") };
  if (!validId(shareId)) return { ok: false, error: err("errors.shareNotFound") };

  const share = await prisma.mediaShare.findFirst({
    where: { id: shareId, media: { profile: { userId } } },
    select: { id: true, mediaId: true, revokedAt: true },
  });
  if (!share) return { ok: false, error: err("errors.shareNotFound") };

  if (share.revokedAt === null) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const revoked = await tx.mediaShare.updateMany({
        where: { id: share.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count === 0) return;
      await audit(
        {
          actorUserId: userId,
          action: "media.share.revoke",
          resourceType: "MediaShare",
          resourceId: share.id,
          after: { mediaId: share.mediaId },
        },
        tx
      );
    });
  }

  revalidateMediaPages();
  return { ok: true };
}
