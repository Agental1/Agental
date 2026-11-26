import { prisma } from "@/lib/db";
import { assistantModelEnabled } from "@/lib/assistant/model";
import { isPaused, onboardingChatSetting } from "@/lib/app-settings";
import { decideChatMode, type ChatMode } from "@/domain/onboarding-chat-switch";
import { workflowMode } from "@/domain/workflow/eligibility";
import { accountCapReached, budgetReached } from "./model";

/**
 * chatMode(user): the one function behind every fallback (design section 5).
 * Never throws: any error reading the settings or the database means "form",
 * so the page never breaks.
 */
export async function chatModeFor(userId: string): Promise<ChatMode> {
  try {
    const [setting, user] = await Promise.all([
      onboardingChatSetting(),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, accountStatus: true, deletedAt: true, kind: true } }),
    ]);
    if (!user || user.deletedAt || user.kind !== "TALENT") return "form";
    const modelEnabled = assistantModelEnabled();
    const [paused, capped, overBudget] = modelEnabled
      ? await Promise.all([isPaused(), accountCapReached(userId), budgetReached()])
      : [false, false, false];
    return decideChatMode({
      setting,
      email: user.email,
      accountStatus: user.accountStatus,
      modelEnabled,
      paused,
      workflowLive: workflowMode() === "live",
      capReached: capped,
      budgetReached: overBudget,
    });
  } catch {
    return "form";
  }
}
