import { prisma } from "@/lib/db";
import { agentDisplayName, agentSetupOf } from "@/domain/agent-setup";

/** The name a performer gave their agent, or null (round 8d). Server-only. */
export async function agentNameFor(userId: string): Promise<string | null> {
  const row = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { agentNameChoice: true, agentCustomName: true, agentHelps: true, agentSavedAt: true },
  });
  return row ? agentDisplayName(agentSetupOf(row)) : null;
}
