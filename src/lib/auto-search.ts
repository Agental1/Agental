import { prisma } from "@/lib/db";
import { startRoleSearch, type StartRoleSearchResult } from "@/lib/role-search";
import { FIRST_AUTO_KEY } from "@/domain/role-search";

/**
 * The first AI search starts on its own (round 7b, 4.1): as soon as a
 * performer's profile reaches 100% and their email is verified. Called after
 * every completeness recompute and after an email is confirmed.
 *
 * Same server rules as a click (startRoleSearch): eligibility (verified,
 * complete, adult, the right status for the mode, so only Test accounts in
 * production's test mode), the quota, the automatic cap of the plan, and no
 * duplicate: the fixed client key FIRST_AUTO_KEY is unique per account, so it
 * can only ever happen once. Being the performer's first search, it counts as
 * their opt-in, like a first click. Never throws.
 */
export async function launchFirstAutoSearch(userId: string, now = new Date()): Promise<StartRoleSearchResult | null> {
  try {
    const done = await prisma.roleSearchRequest.findUnique({
      where: { userId_clientKey: { userId, clientKey: FIRST_AUTO_KEY } },
      select: { id: true },
    });
    if (done) return null;
    return await startRoleSearch(userId, FIRST_AUTO_KEY, now);
  } catch (error) {
    console.error("[auto-search] first search not started", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return null;
  }
}

/** True for two weeks after the first automatic search, for the dashboard notice. */
export async function recentFirstAutoSearch(userId: string, now = new Date()): Promise<boolean> {
  const row = await prisma.roleSearchRequest.findUnique({
    where: { userId_clientKey: { userId, clientKey: FIRST_AUTO_KEY } },
    select: { createdAt: true },
  });
  return !!row && now.getTime() - row.createdAt.getTime() < 14 * 24 * 60 * 60 * 1000;
}
