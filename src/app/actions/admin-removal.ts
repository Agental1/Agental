"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { siteBaseUrl } from "@/lib/email-tokens";
import { restoreAccount, sendWarningEmails, softDeleteAccounts } from "@/lib/admin/account-removal";

/**
 * Round 9, group 1: the two buttons under Admin > Accounts ("Send warning
 * email", "Delete") and "Restore" in Admin > Deleted. Admins only (checked
 * here and in the page); every account changed gets its own audit entry.
 */

/** Back to the list the admin was on, with the result in the query. */
function backTo(formData: FormData, extra: Record<string, string>) {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const raw = String(formData.get("back") ?? "/admin/comptes");
  // Only an admin path: never a redirect elsewhere.
  const path = raw.startsWith("/admin/") && !raw.startsWith("//") ? raw : "/admin/comptes";
  const [p, q = ""] = path.split("?");
  const qs = new URLSearchParams(q);
  for (const k of ["updated", "statusError", "removed", "warned", "skipped", "bulkError"]) qs.delete(k);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  redirect({ href: `${p}?${qs.toString()}`, locale });
}

export async function deleteAccountsForm(formData: FormData): Promise<void> {
  const adminId = await currentAdminId();
  if (!adminId) return backTo(formData, { bulkError: "forbidden" });
  const res = await softDeleteAccounts(adminId, formData.getAll("id").map(String));
  revalidatePath("/[locale]/admin/comptes", "page");
  revalidatePath("/[locale]/admin/suppression", "page");
  if (!res.ok) return backTo(formData, { bulkError: res.reason });
  backTo(formData, { removed: String(res.done), skipped: String(res.skipped) });
}

export async function warnAccountsForm(formData: FormData): Promise<void> {
  const adminId = await currentAdminId();
  if (!adminId) return backTo(formData, { bulkError: "forbidden" });
  const res = await sendWarningEmails(adminId, formData.getAll("id").map(String), siteBaseUrl(process.env, await headers()));
  revalidatePath("/[locale]/admin/comptes", "page");
  if (!res.ok) return backTo(formData, { bulkError: res.reason });
  backTo(formData, { warned: String(res.done), skipped: String(res.skipped) });
}

export async function restoreAccountForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  const ok = adminId ? await restoreAccount(adminId, String(formData.get("id") ?? "")) : false;
  revalidatePath("/[locale]/admin/suppression", "page");
  revalidatePath("/[locale]/admin/comptes", "page");
  redirect({ href: `/admin/suppression?${ok ? "restored=1" : "restoreError=1"}`, locale });
}
