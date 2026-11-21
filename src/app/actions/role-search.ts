"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { err, type ActionError } from "@/domain/action-result";
import { RoleSearchClientKey, type RoleSearchQuota } from "@/domain/role-search";
import { startRoleSearch } from "@/lib/role-search";
import { refusalKey } from "@/domain/workflow/eligibility";

export type StartRoleSearchState =
  | { ok: true; id: string; quota: RoleSearchQuota }
  | { ok: false; error: ActionError; quota?: RoleSearchQuota };

/**
 * "Start finding roles". Checks eligibility and the quota and stores a queued
 * request in one transaction (src/lib/role-search.ts). Calls no workflow.
 */
export async function startFindingRoles(clientKey: string): Promise<StartRoleSearchState> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const key = RoleSearchClientKey.safeParse(clientKey);
  if (!key.success) return { ok: false, error: err("errors.invalidInput") };

  try {
    const res = await startRoleSearch(session.user.id, key.data);
    if (!res.ok && res.reason === "ineligible") {
      return { ok: false, error: err(refusalKey(res.why)), quota: res.quota };
    }
    if (!res.ok) return { ok: false, error: err("errors.roleSearchQuota"), quota: res.quota };
    revalidatePath("/[locale]/talents/(space)/app", "page");
    revalidatePath("/[locale]/talents/(space)/app/candidatures", "page");
    return { ok: true, id: res.id, quota: res.quota };
  } catch (e) {
    console.error("[role-search] start failed", e instanceof Error ? e.message : e);
    return { ok: false, error: err("errors.generic") };
  }
}
