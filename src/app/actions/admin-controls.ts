"use server";

import { revalidatePath } from "next/cache";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { isEmailCategory } from "@/lib/email-unsubscribe";
import { setEmailCategoryApproved, setEmailVerificationRequired, setPaused, setSearchAccess } from "@/lib/app-settings";
import { isSearchAccess } from "@/domain/workflow/eligibility";

/** Round 9: approve (or stop) one automatic email category. Admins only, audited. */
export async function setEmailApprovalForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  const category = String(formData.get("category") ?? "");
  if (adminId && isEmailCategory(category)) {
    await setEmailCategoryApproved(adminId, category, formData.get("approved") === "1");
  }
  revalidatePath("/[locale]/admin/controles", "page");
  redirect({ href: "/admin/controles?saved=1", locale });
}

/** Round 9, group 9: pause or resume everything automatic. Admins only, audited. */
export async function setPauseForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  if (adminId) await setPaused(adminId, formData.get("paused") === "1");
  revalidatePath("/[locale]/admin", "layout");
  redirect({ href: "/admin/controles?saved=1", locale });
}

/**
 * Round 10, group 3: "AI searches are open to" (Test accounts only, or all
 * verified performers at 100%). Opening to everyone needs the confirmation box
 * ticked; going back to Test accounts only never does. Admins only, audited.
 */
export async function setSearchAccessForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  const access = String(formData.get("access") ?? "");
  const confirmed = formData.get("confirm") === "yes";
  if (adminId && isSearchAccess(access) && (access === "test_only" || confirmed)) {
    await setSearchAccess(adminId, access);
    revalidatePath("/[locale]/admin", "layout");
    redirect({ href: "/admin/controles?saved=1", locale });
  }
  redirect({ href: "/admin/controles?confirm=1", locale });
}

/**
 * Round 11: "Email verification required before the dashboard". Turning it on
 * needs the confirmation box (codes must really arrive first); turning it off
 * never does. Admins only, audited.
 */
export async function setEmailGateForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  const required = formData.get("required") === "1";
  if (adminId && (!required || formData.get("confirm") === "yes")) {
    await setEmailVerificationRequired(adminId, required);
    revalidatePath("/[locale]/admin", "layout");
    redirect({ href: "/admin/controles?saved=1", locale });
  }
  redirect({ href: "/admin/controles?gateConfirm=1#email-gate", locale });
}
