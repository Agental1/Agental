import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { isAdminAccount } from "@/domain/admin";
import { AI_PROVIDERS } from "@/domain/ai-spend";
import { ALERT_EMAIL } from "@/lib/ai-spend";

/**
 * Round 9, group 9: Admin > AI accounts, the last 30 days. Read-only: nothing
 * here can add money at a provider. Counts and amounts only.
 */
const DAY = 24 * 60 * 60 * 1000;

export async function last30Days(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [searches, replies, emails, texts, cost, accounts] = await Promise.all([
    prisma.roleSearchRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.aiUsage.count({ where: { kind: "assistant.reply", createdAt: { gte: since } } }),
    prisma.emailLog.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.smsLog.groupBy({ by: ["kind", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.aiUsage.groupBy({ by: ["provider"], where: { createdAt: { gte: since } }, _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    prisma.aiProviderAccount.findMany({ select: { provider: true, monthlyBudgetCents: true } }),
  ]);
  const providers = AI_PROVIDERS.map((p) => {
    const c = cost.find((x) => x.provider === p);
    const budget = accounts.find((a) => a.provider === p)?.monthlyBudgetCents ?? null;
    const cents = Math.ceil((c?._sum.costMicroUsd ?? 0) / 10_000);
    return {
      provider: p,
      jobs: c?._count._all ?? 0,
      tokens: (c?._sum.inputTokens ?? 0) + (c?._sum.outputTokens ?? 0),
      cents,
      budgetCents: budget,
      share: budget ? cents / budget : null,
    };
  });
  return {
    searches: Object.fromEntries(searches.map((s) => [s.status, s._count._all])) as Record<string, number>,
    assistantReplies: replies,
    emails: emails.map((e) => ({ kind: e.kind, n: e._count._all })).sort((a, b) => b.n - a.n),
    texts: texts.map((t) => ({ kind: t.kind, status: t.status, n: t._count._all })),
    providers,
  };
}

/**
 * Round 9: a workflow failing again and again (3 failed searches or more in
 * 24 hours) alerts the admins once a day, in the bell and by email.
 */
export async function alertRepeatedFailures(now = new Date()): Promise<boolean> {
  const failed = await prisma.roleSearchRequest.count({ where: { status: "failed", completedAt: { gte: new Date(now.getTime() - DAY) } } });
  if (failed < 3) return false;
  const day = now.toISOString().slice(0, 10);
  const key = `"workflow_failures":"${day}"`;
  if ((await prisma.notification.count({ where: { kind: "ALERT", payload: { contains: key } } })) > 0) return false;
  const admins = (await prisma.user.findMany({ where: { isAdmin: true, deletedAt: null }, select: { id: true, isAdmin: true, email: true } })).filter((u) => isAdminAccount(u));
  const title = `The casting workflow failed ${failed} times in 24 hours`;
  const body = "Open Admin > Applications and AI jobs to read the errors. Admin > Controls can pause everything.";
  await prisma.notification.createMany({
    data: admins.map((u) => ({ userId: u.id, kind: "ALERT", title, body, link: "/admin/recherches", payload: JSON.stringify({ workflow_failures: day, failed }) })),
  });
  await sendEmail({ to: ALERT_EMAIL, kind: "ai_spend_alert", subject: `[Agental] ${title}`, text: body, html: `<p>${body}</p>` }).catch(() => {});
  return true;
}
