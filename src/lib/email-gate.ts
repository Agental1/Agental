import { prisma } from "@/lib/db";
import { emailVerificationRequired } from "@/lib/app-settings";
import { emailCodeAvailable } from "@/lib/email-code";
import { requiresEmailVerification } from "@/domain/email-verification";

/**
 * Round 11: must this account enter its sign-up code before any app page?
 * Called by the talents and casting layouts and both onboarding pages; they
 * redirect to /verifier when true. The switch is off by default (Admin >
 * Controls), so this answers false for everyone until staff turn it on.
 */
export async function mustVerifyEmail(userId: string): Promise<boolean> {
  const [user, gateOn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, passwordHash: true } }),
    emailVerificationRequired(),
  ]);
  if (!user) return false;
  return requiresEmailVerification(user, { gateOn, senderConfigured: emailCodeAvailable() });
}
