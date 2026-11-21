"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { err, type ActionError } from "@/domain/action-result";
import { SchoolEmail } from "@/domain/student";
import { siteBaseUrl } from "@/lib/email-tokens";
import { requestStudentVerification } from "@/lib/student-email";

export type StudentEmailState =
  | undefined
  | { ok: true; email: string; delivered: boolean }
  | { ok: false; error: ActionError };

const REASON: Record<string, ActionError["key"]> = {
  not_school: "errors.studentEmailNotSchool",
  taken: "errors.studentEmailTaken",
  already: "errors.studentEmailAlready",
  rate_limited: "errors.studentEmailTooMany",
  send_failed: "errors.generic",
};

/** "College student? Verify your school email." Sends the confirmation link. */
export async function requestStudentEmail(
  _prev: StudentEmailState,
  formData: FormData
): Promise<StudentEmailState> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const parsed = SchoolEmail.safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { ok: false, error: err("errors.studentEmailInvalid") };

  let baseUrl: string;
  try {
    baseUrl = siteBaseUrl(process.env, await headers());
  } catch {
    return { ok: false, error: err("errors.generic") };
  }
  const res = await requestStudentVerification({
    userId: session.user.id,
    email: parsed.data,
    locale: String(formData.get("locale") ?? "en"),
    baseUrl,
  });
  if (!res.ok) return { ok: false, error: err(REASON[res.reason] ?? "errors.generic") };
  revalidatePath("/[locale]/talents/(space)/app/abonnement", "page");
  return { ok: true, email: parsed.data, delivered: res.delivered };
}

export type ConfirmStudentState =
  | undefined
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" | "taken" };

/**
 * Confirm a school email from the link. A button press, not the page load:
 * mail scanners open links, and a GET must not use the token up.
 */
export async function confirmStudentEmailAction(
  _prev: ConfirmStudentState,
  formData: FormData
): Promise<ConfirmStudentState> {
  const { confirmStudentEmail } = await import("@/lib/student-email");
  const res = await confirmStudentEmail(formData.get("token"));
  if (res.ok) revalidatePath("/[locale]/talents/(space)/app/abonnement", "page");
  return res;
}
