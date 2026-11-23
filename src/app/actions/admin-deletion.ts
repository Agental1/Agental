"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { deletionDays } from "@/domain/account-deletion";
import { siteBaseUrl } from "@/lib/email-tokens";
import { deleteEligibleAccounts, sendDeletionWarnings } from "@/lib/admin/account-deletion";

function back(locale: string, days: number, extra: Record<string, string>) {
  const qs = new URLSearchParams({ days: String(days), ...extra });
  redirect({ href: `/admin/suppression?${qs.toString()}`, locale: toLocale(locale) });
}

/** "Send the warning email" to every candidate not warned yet. Admins only. */
export async function sendDeletionWarningsForm(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  const days = deletionDays(String(formData.get("days") ?? ""), deletionDays(process.env.ACCOUNT_DELETION_AFTER_DAYS));
  const adminId = await currentAdminId();
  if (!adminId) return back(locale, days, { error: "forbidden" });
  const res = await sendDeletionWarnings(adminId, days, siteBaseUrl(process.env, await headers()));
  revalidatePath("/[locale]/admin/suppression", "page");
  if (!res.ok) return back(locale, days, { error: res.reason });
  back(locale, days, { warned: String(res.sent), remaining: String(res.remaining) });
}

/**
 * "Delete the ticked accounts", with the typed confirmation ("DELETE <number
 * ticked>"). Every eligible account is ticked by default (round 8c). Admins only.
 */
export async function deleteEligibleAccountsForm(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  const days = deletionDays(String(formData.get("days") ?? ""), deletionDays(process.env.ACCOUNT_DELETION_AFTER_DAYS));
  const adminId = await currentAdminId();
  if (!adminId) return back(locale, days, { error: "forbidden" });
  const res = await deleteEligibleAccounts(
    adminId,
    days,
    String(formData.get("confirm") ?? ""),
    String(formData.get("fingerprint") ?? ""),
    undefined,
    undefined,
    formData.getAll("ids").map(String).filter((id) => id.length > 0 && id.length < 64)
  );
  revalidatePath("/[locale]/admin/suppression", "page");
  revalidatePath("/[locale]/admin/comptes", "page");
  if (!res.ok) return back(locale, days, { error: res.reason });
  back(locale, days, { deleted: String(res.deleted), failed: String(res.failed), remaining: String(res.remaining) });
}
