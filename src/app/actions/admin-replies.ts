"use server";

import { revalidatePath } from "next/cache";
import { currentAdminId } from "@/lib/limelight/admin";
import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { discardDraft, sendDraft } from "@/lib/reply-drafts";

/** Round 9: Send, Edit then send, Discard on a reply draft. Admins only; the lib audits. */
export async function decideReplyForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const adminId = await currentAdminId();
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  let result = "forbidden";
  if (adminId && /^[a-z0-9]{10,40}$/i.test(id)) {
    const res =
      action === "discard"
        ? await discardDraft(adminId, id)
        : await sendDraft(adminId, id, action === "edit" ? String(formData.get("text") ?? "") : null);
    result = res.ok ? (action === "discard" ? "discarded" : "sent") : res.reason;
  }
  revalidatePath("/[locale]/admin/reponses", "page");
  redirect({ href: `/admin/reponses?result=${encodeURIComponent(result)}`, locale });
}
