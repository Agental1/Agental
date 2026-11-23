"use server";

import { revalidatePath } from "next/cache";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { isEmailCategory } from "@/lib/email-unsubscribe";
import { setEmailCategoryApproved } from "@/lib/app-settings";

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
