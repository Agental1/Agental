import { prisma } from "@/lib/db";
import { ELIGIBILITY_SELECT, emailIsVerified } from "@/lib/agents";
import { isAdult } from "@/domain/age";
import { effectiveStatus } from "@/domain/account-model";
import { completenessInputOf, missingItems } from "@/domain/completeness";
import { searchBlock, type SearchBlock, type SearchNotice } from "@/domain/search-block";
import { workflowMode, type SearchAccess, type WorkflowMode } from "@/domain/workflow/eligibility";
import { getRoleSearchQuota } from "@/lib/role-search";
import { isPaused, searchAccess } from "@/lib/app-settings";

/**
 * Round 10, group 3: the one reason an account cannot start a search right
 * now, read from the database with the same facts as the server gate
 * (src/lib/agents.ts) and the same 100% rule. Null: the button works.
 */
export async function searchBlockFor(
  userId: string,
  opts: { now?: Date; mode?: WorkflowMode; access?: SearchAccess } = {}
): Promise<SearchBlock | null> {
  const now = opts.now ?? new Date();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: ELIGIBILITY_SELECT,
  });
  if (!u) return { reason: "blocked" };
  const p = u.artistProfile;
  const quota = await getRoleSearchQuota(userId, now);
  return searchBlock({
    kind: u.kind,
    accountStatus: effectiveStatus(u),
    deleted: !!u.deletedAt,
    isAdult: !!p && !p.isMinor && isAdult(p.birthDate, now),
    emailVerified: !!emailIsVerified(u),
    missing: p ? missingItems(completenessInputOf(p)) : ["legalName"],
    quota,
    mode: opts.mode ?? workflowMode(),
    access: opts.access ?? (await searchAccess()),
  });
}

/** Is the search service connected? Without the n8n secret nothing claims searches. */
export function searchServiceConnected(env: Record<string, string | undefined> = process.env): boolean {
  return (env.N8N_SHARED_SECRET ?? "").trim().length >= 24;
}

/**
 * "Searches are paused for a moment": staff paused everything, or the search
 * service is not connected. The click is still saved and starts by itself.
 */
export async function searchPausedNotice(): Promise<SearchNotice | null> {
  if ((await isPaused()) || !searchServiceConnected()) return { kind: "paused" };
  return null;
}
