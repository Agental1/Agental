"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { isAccountStatus, type AccountStatus } from "@/domain/workflow/eligibility";

/** Most accounts one submit may change: a page of the list. */
const MAX_BULK = 500;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type SetStatusResult =
  | { ok: true; changed: number }
  | { ok: false; reason: "forbidden" | "invalid" };

/**
 * Change the review status of one or many accounts. Admins only, checked on
 * the server from the database. Each account that really changes gets its own
 * audit entry (before and after), written in the same transaction.
 */
export async function setAccountStatus(ids: string[], status: AccountStatus): Promise<SetStatusResult> {
  const adminId = await currentAdminId();
  if (!adminId) return { ok: false, reason: "forbidden" };
  const unique = [...new Set(ids)];
  if (!isAccountStatus(status) || unique.length === 0 || unique.length > MAX_BULK || !unique.every((id) => ID.test(id))) {
    return { ok: false, reason: "invalid" };
  }
  const changed = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findMany({
      where: { id: { in: unique }, accountStatus: { not: status } },
      select: { id: true, accountStatus: true },
    });
    let n = 0;
    for (const u of before) {
      // Conditional on the status just read: a concurrent change makes this
      // match nothing, so the audit entry never records a wrong "before".
      const { count } = await tx.user.updateMany({
        where: { id: u.id, accountStatus: u.accountStatus },
        data: { accountStatus: status },
      });
      if (count !== 1) continue;
      n += 1;
      await audit(
        {
          actorUserId: adminId,
          action: "admin.account.status",
          resourceType: "User",
          resourceId: u.id,
          before: { accountStatus: u.accountStatus },
          after: { accountStatus: status, bulk: unique.length > 1 },
        },
        tx
      );
    }
    return n;
  });
  revalidatePath("/[locale]/admin/comptes", "page");
  revalidatePath("/[locale]/admin/comptes/[id]", "page");
  revalidatePath("/[locale]/admin", "page");
  return { ok: true, changed };
}

/** The form behind the list and the account page. Goes back to where it came from. */
export async function setAccountStatusForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const ids = formData.getAll("id").map(String);
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "/admin/comptes");
  const safeBack = /^\/admin\/comptes(\/[A-Za-z0-9_-]+)?(\?[^#]*)?$/.test(back) ? back : "/admin/comptes";
  const res = isAccountStatus(status) ? await setAccountStatus(ids, status) : ({ ok: false, reason: "invalid" } as const);
  const [path, query = ""] = safeBack.split("?");
  const qs = new URLSearchParams(query);
  qs.delete("updated");
  qs.delete("statusError");
  if (res.ok) qs.set("updated", String(res.changed));
  else qs.set("statusError", res.reason);
  redirect({ href: `${path}?${qs.toString()}`, locale });
}
