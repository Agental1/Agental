"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError } from "@/domain/action-result";
import { sendDealDecision } from "@/lib/n8n/deals";

export type DealDecisionState =
  | { ok: true; decision: "accept" | "deny" }
  | { ok?: false; error?: ActionError }
  | undefined;

const DecisionInput = z.object({
  taskId: z.string().min(1).max(200),
  decision: z.enum(["accept", "deny"]),
  comment: z.string().max(1000).default(""),
});

/**
 * The talent says yes or no to a deal the agent negotiated. Nothing is sent
 * to the casting director from here: n8n drafts the email, a person sends it.
 */
export async function decideDeal(
  _prev: DealDecisionState,
  formData: FormData
): Promise<DealDecisionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: err("errors.unauthorized") };

  const parsed = DecisionInput.safeParse({
    taskId: formData.get("taskId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { error: err("errors.dealInvalid") };

  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) return { error: err("errors.forbidden") };

  const { taskId, decision, comment } = parsed.data;
  const outcome = await sendDealDecision(profile.id, taskId, decision, comment.trim());
  if (outcome === "not_found") return { error: err("errors.dealNotFound") };
  if (outcome !== "ok") return { error: err("errors.dealSendFailed") };

  await audit({
    actorUserId: session.user.id,
    action: decision === "accept" ? "deal.accepted" : "deal.declined",
    resourceType: "N8nDeal",
    resourceId: taskId,
    after: { decision, hasComment: comment.trim().length > 0 },
  });
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, decision };
}
