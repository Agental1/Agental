"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { err, type ActionError } from "@/domain/action-result";
import { RoleSearchClientKey, type RoleSearchQuota } from "@/domain/role-search";
import { startRoleSearch } from "@/lib/role-search";
import { refusalKey } from "@/domain/workflow/eligibility";
import { hitRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { searchBlockFor, searchPausedNotice } from "@/lib/search-block";
import type { SearchBlock, SearchNotice } from "@/domain/search-block";

/**
 * Round 8c: at most 20 presses of "Start finding roles" an hour per person,
 * on top of the plan quota (which bounds the searches themselves). Stops a
 * script or a stuck button from hammering the quota transaction.
 */
const SEARCH_START_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 } as const;

export type StartRoleSearchState =
  | { ok: true; id: string; quota: RoleSearchQuota; notice?: SearchNotice }
  | { ok: false; error: ActionError; quota?: RoleSearchQuota; block?: SearchBlock };

/**
 * "Start finding roles". Checks eligibility and the quota and stores a queued
 * request in one transaction (src/lib/role-search.ts). Calls no workflow.
 * Round 10: a refusal carries its one reason (src/domain/search-block.ts), and
 * a saved search says when it starts if it waits (slots busy, service paused).
 */
export async function startFindingRoles(clientKey: string): Promise<StartRoleSearchState> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const key = RoleSearchClientKey.safeParse(clientKey);
  if (!key.success) return { ok: false, error: err("errors.invalidInput") };

  try {
    const gate = await hitRateLimit(prisma, `role-search:start:${session.user.id}`, SEARCH_START_LIMIT);
    if (!gate.allowed) return { ok: false, error: err("errors.tooManyAttempts") };
    const res = await startRoleSearch(session.user.id, key.data);
    if (!res.ok) {
      // The same reason the dashboard shows, read again after the refusal.
      const block = (await searchBlockFor(session.user.id)) ?? undefined;
      const error =
        res.reason === "ineligible" ? err(refusalKey(res.why)) : err("errors.roleSearchQuota");
      return { ok: false, error, quota: res.quota, block };
    }
    revalidatePath("/[locale]/talents/(space)/app", "page");
    revalidatePath("/[locale]/talents/(space)/app/candidatures", "page");
    const paused = await searchPausedNotice();
    const later = res.scheduledFor && res.scheduledFor.getTime() > Date.now() + 60_000;
    const notice: SearchNotice | undefined =
      paused ?? (later ? { kind: "queued", startsAt: res.scheduledFor!.toISOString() } : undefined);
    return { ok: true, id: res.id, quota: res.quota, notice };
  } catch (e) {
    console.error("[role-search] start failed", e instanceof Error ? e.message : e);
    return { ok: false, error: err("errors.generic") };
  }
}
