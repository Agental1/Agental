import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { canReadMedia } from "@/lib/media-access";

/**
 * Serve a stored media object by its Media row id.
 *
 * This handler had NO authentication: it streamed any Media row to anyone who
 * knew (or guessed) an id. That covers talent photos, reels and self-tapes,
 * minors' included — and `Cache-Control: private` is a caching directive, not
 * an access control. The proxy matcher excludes /api, so nothing sat in front
 * of it either.
 *
 * Three parties may legitimately read a media object:
 *   - the talent who owns the profile it hangs off;
 *   - a casting user whose organisation has a candidature on that profile,
 *     which is the whole point of a shortlist (self-tapes, photos);
 *   - an admin, for the minors compliance back-office.
 *
 * The rule itself lives in lib/media-access.ts, where it can be tested.
 * Anything else gets 404 rather than 403: telling an unauthenticated caller
 * that an id exists is itself a disclosure.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Not found", { status: 404 });

  const media = await prisma.media.findUnique({
    where: { id },
    select: { storageKey: true, mime: true, profileId: true },
  });
  if (!media) return new Response("Not found", { status: 404 });

  if (!(await canReadMedia(userId, media.profileId))) {
    return new Response("Not found", { status: 404 });
  }

  const storage = await getStorage();
  const obj = await storage.get(media.storageKey);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "Content-Type": obj.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
