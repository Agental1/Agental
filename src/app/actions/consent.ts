"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError } from "@/domain/action-result";
import { ConsentChoice, consentColumns } from "@/domain/consent";
import { writeConsentCookie } from "@/lib/consent";

export type SaveConsentResult = { ok: true } | { ok: false; error: ActionError };

/**
 * Record the cookie choice: "Accept all", "Reject non-essential", or the
 * toggles in Manage preferences and in Settings.
 *
 * Works signed out too, where it only writes the cookie (the banner can also
 * write that cookie itself). Signed in, the user row is the record and each
 * change is audited, since consent has to be provable later.
 */
export async function saveConsent(input: unknown): Promise<SaveConsentResult> {
  const parsed = ConsentChoice.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const choice = parsed.data;

  await writeConsentCookie(choice);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: true };

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { consentAnalytics: true, consentMarketing: true },
  });
  if (!before) return { ok: false, error: err("errors.unauthorized") };

  await prisma.user.update({ where: { id: userId }, data: consentColumns(choice) });
  await audit({
    actorUserId: userId,
    action: "consent.update",
    resourceType: "User",
    resourceId: userId,
    before: { analytics: before.consentAnalytics, marketing: before.consentMarketing },
    after: choice,
  });
  return { ok: true };
}
