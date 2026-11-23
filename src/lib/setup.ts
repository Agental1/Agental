import { prisma } from "@/lib/db";
import { nextSetupStep, type SetupStep } from "@/domain/setup";

/**
 * Where a performer stands in the account setup, for the dashboard's
 * "Complete my profile" card, the wizard's resume point and the layout.
 * Server-only. Works for an account that has no profile row yet.
 */
export interface SetupState {
  /** The first unfinished step, or null when the basics are saved. */
  nextStep: SetupStep | null;
  /** Stamped once the first-run screen was served. */
  onboardingCompletedAt: Date | null;
}

export async function getSetupState(userId: string): Promise<SetupState> {
  // One after the other on purpose: the local test database answers a single
  // query at a time.
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: {
      legalFirstName: true,
      legalLastName: true,
      legalName: true,
      birthDate: true,
      gender: true,
    },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });
  return {
    nextStep: nextSetupStep(
      profile
    ),
    onboardingCompletedAt: user?.onboardingCompletedAt ?? null,
  };
}
