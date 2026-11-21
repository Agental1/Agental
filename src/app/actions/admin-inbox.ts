"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { currentAdminId } from "@/lib/limelight/admin";
import { markInboxReviewed } from "@/lib/n8n/inbox";

/** Staff handled an email in Gmail: it leaves the waiting list. Admin only, audited. */
export async function markInboxReviewedForm(formData: FormData): Promise<void> {
  const adminId = await currentAdminId();
  const id = String(formData.get("id") ?? "");
  if (!adminId || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  if (await markInboxReviewed(id)) {
    await audit({ actorUserId: adminId, action: "admin.inbox.reviewed", resourceType: "InboxReply", resourceId: id });
  }
  revalidatePath("/[locale]/admin/messages", "page");
}
