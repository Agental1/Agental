"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { err, type ActionError } from "@/domain/action-result";
import { AgentSetupInput } from "@/domain/agent-setup";
import { audit } from "@/lib/audit";

/**
 * Round 8b: save the AI agent setup from Messages on the performer's profile.
 * Nothing else happens: no model call, no workflow, no message (the agent is
 * not live until round 9).
 */
export async function saveAgentSetup(input: unknown): Promise<{ ok: boolean; error?: ActionError }> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return { ok: false, error: err("errors.unauthorized") };
  const parsed = AgentSetupInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const profile = await prisma.artistProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const v = parsed.data;
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      agentNameChoice: v.name,
      agentCustomName: v.name === "custom" ? v.customName : null,
      agentHelps: JSON.stringify(v.helps),
      agentSavedAt: new Date(),
    },
  });
  await audit({
    actorUserId: session.user.id,
    action: "agent.setup.save",
    resourceType: "ArtistProfile",
    resourceId: profile.id,
    after: { name: v.name, helps: v.helps },
  });
  revalidatePath("/[locale]/talents/(space)/app/messages", "page");
  return { ok: true };
}
