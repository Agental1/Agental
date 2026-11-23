"use server";

import { redirect } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { applyUnsubscribe } from "@/lib/email-unsubscribe";

/** Round 9: the button on the unsubscribe page. The signed link decides whose emails stop. */
export async function unsubscribeForm(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? "en"));
  const u = String(formData.get("u") ?? "");
  const c = String(formData.get("c") ?? "");
  const t = String(formData.get("t") ?? "");
  const ok = await applyUnsubscribe(u, c, t);
  const q = new URLSearchParams({ u, c, t, ...(ok ? { done: "1" } : {}) }).toString();
  redirect({ href: `/desabonnement?${q}`, locale });
}
