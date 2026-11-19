import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { hitRateLimit } from "@/lib/rate-limit";
import {
  clientAddress,
  hashShareToken,
  isShareToken,
  SHARE_VIEW_RATE,
  shareIsActive,
  shareRateKey,
  startsViewing,
} from "@/lib/share";

/**
 * Open a share link: GET /api/share/<token>. It works without a session:
 * holding the link is the permission, for as long as the link works.
 *
 * The token is hashed and looked up by its hash. A link that never existed,
 * was revoked, has expired, or points at a clip that is gone or not ready
 * gets one and the same 404, so a guess or an old link learns nothing about
 * which of those it was. A working link is counted and answered with a
 * redirect to a short-lived signed address of the file, the way
 * /api/media/[id] answers its own readers.
 *
 * Every answer says: do not store this, do not send a referrer, do not index
 * this. Requests are limited per client address before the token is looked
 * at, so the limit answers the same for a good link and a bad one. The
 * address is only ever used as a keyed hash. The address and the token are
 * never stored or logged.
 */

/**
 * How long the signed address behind a share link lives. Long enough to watch
 * a self-tape through, short enough that a revoked link stops working soon:
 * an address handed out just before a revoke dies within this time.
 */
const SHARE_SIGNED_URL_SECONDS = 15 * 60;

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
} as const;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: HEADERS });
}

function tooManyRequests(retryAfterMs: number): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      ...HEADERS,
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    },
  });
}

/** The error's class and, for Prisma, its code. Its message stays out. */
function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name} ${code}` : error.name;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let shareId: string | null = null;

  try {
    const limit = await hitRateLimit(
      prisma,
      shareRateKey(clientAddress(req.headers)),
      SHARE_VIEW_RATE
    );
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    if (!isShareToken(token)) return notFound();

    const now = new Date();
    const share = await prisma.mediaShare.findUnique({
      where: { tokenHash: hashShareToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        media: {
          select: {
            storageKey: true,
            mime: true,
            status: true,
            profile: { select: { isMinor: true } },
          },
        },
      },
    });
    // Deleting a clip deletes its links with it, so "the clip is gone" is the
    // first case here. A profile marked as a minor's shares nothing.
    if (
      !share ||
      !shareIsActive(share, now) ||
      share.media.status !== "READY" ||
      share.media.profile.isMinor
    ) {
      return notFound();
    }
    shareId = share.id;

    // Prepare the answer first, so a view is only counted for a file that
    // can be served.
    const storage = await getStorage();
    let answer: () => Response;
    if (storage.signedUrl) {
      const location = await storage.signedUrl(share.media.storageKey, {
        mime: share.media.mime,
        expiresInSeconds: SHARE_SIGNED_URL_SECONDS,
      });
      answer = () =>
        new Response(null, {
          status: 302,
          headers: { ...HEADERS, Location: location },
        });
    } else {
      // Local disk (development) cannot sign: the bytes go through us.
      const file = await storage.get(share.media.storageKey);
      if (!file) return notFound();
      answer = () =>
        new Response(new Uint8Array(file.bytes), {
          status: 200,
          headers: { ...HEADERS, "Content-Type": file.mime },
        });
    }

    // Counting is also the last check: the update only matches a link that
    // still works, so a link revoked a moment ago is refused here.
    const counted = await prisma.mediaShare.updateMany({
      where: { id: share.id, revokedAt: null, expiresAt: { gt: now } },
      data: {
        lastViewedAt: now,
        ...(startsViewing(req.headers.get("range"))
          ? { viewCount: { increment: 1 } }
          : {}),
      },
    });
    if (counted.count === 0) return notFound();

    return answer();
  } catch (error) {
    // The record id at most: never the token, the address or a signed URL.
    console.error("[share] request failed", { shareId, error: errorLabel(error) });
    return new Response("Unavailable", { status: 503, headers: HEADERS });
  }
}
