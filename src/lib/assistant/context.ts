import { prisma } from "@/lib/db";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { COMPLETENESS_SELECT } from "@/lib/completeness";
import {
  completenessInputOf,
  missingItems,
  profileGaps,
  scoreProfile,
  type MissingItem,
  type ProfileGap,
} from "@/domain/completeness";
import { IN_PROGRESS_STATUSES } from "@/domain/role-search";
import type { AssistantContext, MessageTopic } from "@/domain/assistant";
import { agentDisplayName, agentSetupOf } from "@/domain/agent-setup";
import { getRoleSearchQuota } from "@/lib/role-search";

/**
 * The minimum the assistant needs for one topic, read on the server.
 * Whitelist only: no contact details, no content boundaries, no media links.
 * readPreferences already leaves the private content boundaries out.
 */
export async function buildAssistantContext(
  userId: string,
  topic: MessageTopic,
  locale: string
): Promise<AssistantContext> {
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { id: true, agentNameChoice: true, agentCustomName: true, agentHelps: true, agentSavedAt: true, ...COMPLETENESS_SELECT },
  });
  const { plan } = await getTalentPlan(userId);
  const ctx: AssistantContext = {
    topic,
    locale,
    name: (profile?.stageName ?? "").trim().split(/\s+/)[0] ?? "",
    plan,
  };
  if (!profile) return ctx;

  // Round 9: the agent's name and the help the performer chose, searches and roles found (every topic).
  const setup = agentSetupOf(profile);
  ctx.agent = { name: agentDisplayName(setup), helps: setup?.helps ?? [] };
  const [quota, inProgress, found] = await Promise.all([
    getRoleSearchQuota(userId),
    prisma.roleSearchRequest.count({ where: { userId, status: { in: [...IN_PROGRESS_STATUSES] } } }),
    prisma.applicationDraft.findMany({
      // The same roles the performer sees on Applications.
      where: { profileId: profile.id, brief: { source: "n8n-beta-v2" }, status: { not: "DECLINED" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { status: true, brief: { select: { title: true, roleName: true } } },
    }),
  ]);
  ctx.searches = { limit: quota.limit, used: quota.used, remaining: quota.remaining, inProgress, resetInDays: quota.resetInDays };
  // Titles come from web listings: no address or link reaches the model.
  const plain = (s: string) => s.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 120);
  ctx.rolesFound = found.map((d) => ({ project: plain(d.brief.title), role: d.brief.roleName ? plain(d.brief.roleName) : null, status: d.status }));

  if (topic === "profile") {
    const input = completenessInputOf(profile);
    // The next required item first, then optional ones the assistant may suggest.
    const missing: (MissingItem | ProfileGap)[] = [...missingItems(input)];
    for (const gap of profileGaps(input)) if (!missing.includes(gap)) missing.push(gap);
    ctx.profile = {
      completeness: scoreProfile(input),
      missing,
      specialties: profile.specialties.map((s) => s.kind),
      preferences: input.preferences,
      hasImdbLink: !!profile.imdbUrl,
      hasPortfolioLink: !!profile.portfolioUrl,
    };
  }

  if (topic === "application") {
    const [cands, searches] = await Promise.all([
      prisma.candidature.findMany({
        where: { artistProfileId: profile.id },
        orderBy: { appliedAt: "desc" },
        take: 10,
        select: { status: true, appliedAt: true, project: { select: { title: true } } },
      }),
      prisma.roleSearchRequest.count({
        where: { userId, status: { in: [...IN_PROGRESS_STATUSES] } },
      }),
    ]);
    ctx.applications = {
      items: cands.map((c) => ({
        title: c.project.title,
        status: c.status,
        appliedAt: c.appliedAt.toISOString().slice(0, 10),
      })),
      searchesInProgress: searches,
    };
  }
  return ctx;
}
