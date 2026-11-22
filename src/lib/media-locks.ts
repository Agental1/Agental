import { prisma } from "@/lib/db";

/**
 * A clip given in a submitted application response stays until the Agental
 * team has reviewed it: deleting it would leave the response without a
 * requested video. True when any of these media is in a SUBMITTED response.
 */
export async function usedInSubmittedResponse(mediaIds: string[]): Promise<boolean> {
  if (mediaIds.length === 0) return false;
  const n = await prisma.draftMedia.count({ where: { mediaId: { in: mediaIds }, draft: { status: "SUBMITTED" } } });
  return n > 0;
}

/** The same, for every take of a tape. */
export async function tapeUsedInSubmittedResponse(tapeId: string): Promise<boolean> {
  const n = await prisma.draftMedia.count({ where: { draft: { status: "SUBMITTED" }, media: { selfTape: { tapeId } } } });
  return n > 0;
}
