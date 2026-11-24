"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError } from "@/domain/action-result";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION, acceptanceColumns } from "@/domain/legal-versions";
import { termsPageEnabled } from "@/domain/legal/terms";

export type AcceptLegalResult = { ok: true } | { ok: false; error: ActionError };

/**
 * Round 11, group 3: an account with no recorded acceptance of the current
 * Privacy Policy (older accounts, Google sign-ups) ticks the box once, at its
 * next sign-in. Records the date and version on the account, audited.
 */
export async function acceptLegalDocuments(agreed: unknown): Promise<AcceptLegalResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: err("errors.unauthorized") };
  if (agreed !== true) return { ok: false, error: err("errors.privacyRequired") };
  const terms = termsPageEnabled();
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { privacyVersion: true, termsVersion: true, deletedAt: true },
  });
  if (!before || before.deletedAt) return { ok: false, error: err("errors.unauthorized") };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: acceptanceColumns(terms) });
    await audit(
      {
        actorUserId: userId,
        action: "legal.accepted",
        resourceType: "User",
        resourceId: userId,
        before: { privacyVersion: before.privacyVersion, termsVersion: before.termsVersion },
        after: { privacyVersion: PRIVACY_POLICY_VERSION, ...(terms ? { termsVersion: TERMS_VERSION } : {}), via: "prompt" },
      },
      tx
    );
  });
  return { ok: true };
}
