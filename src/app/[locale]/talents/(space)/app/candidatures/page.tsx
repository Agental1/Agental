import { toLocale } from "@/i18n/routing";
import { parseJson } from "@/domain/json";
import { MatchReasons } from "@/domain/match-reason";
import { CandidatureStatus } from "@/domain/enums";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Radar } from "lucide-react";
import { getRoleSearchQuota, listMyRoleSearches } from "@/lib/role-search";
import { date, dateTime } from "@/lib/format";
import { hoursUntil, SEARCH_SPACING_HOURS } from "@/domain/role-search";
import { readSubmission } from "@/domain/application-response";
import { FoundRoleCard, type FoundRole } from "@/components/talents/found-role-card";
import {
  CandidaturesList,
  type CandidatureRow,
} from "@/components/app/candidatures-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.candidatures.title") };
}

export default async function CandidaturesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return null;

  const candidatures = await prisma.candidature.findMany({
    where: { artistProfileId: profile.id },
    include: { project: true, matchScore: true },
    orderBy: { appliedAt: "desc" },
  });

  // Round 8b: three search states. Searches run one every 6 hours; each queued
  // search shows when it starts, from its scheduled time.
  const now = new Date();
  const [searches, quota] = await Promise.all([
    listMyRoleSearches(session.user.id, 30),
    getRoleSearchQuota(session.user.id, now),
  ]);
  const queued = searches
    .filter((r) => r.status === "queued")
    .sort((a, b) => (a.scheduledFor ?? a.createdAt).getTime() - (b.scheduledFor ?? b.createdAt).getTime());
  const running = searches.filter((r) => r.status === "running");
  const finished = searches.filter((r) => r.status === "done").slice(0, 5);

  // Roles found by the agents. Declined ones leave the list. Nothing is sent.
  const drafts = await prisma.applicationDraft.findMany({
    where: { profileId: profile.id, brief: { source: "n8n-beta-v2" }, status: { not: "DECLINED" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      brief: {
        select: {
          title: true,
          production: true,
          roleName: true,
          description: true,
          sourceRef: true,
          location: true,
          remote: true,
          startsOn: true,
          endsOn: true,
          paid: true,
          rateCents: true,
          unionStatus: true,
          submission: true,
        },
      },
    },
  });
  const usd = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return null;
    }
  };
  const found: FoundRole[] = drafts.map((d) => {
    const b = d.brief;
    const sub = readSubmission(b.submission);
    const dates =
      b.startsOn && b.endsOn
        ? t("space.candidatures.decide.dateRange", { from: date(b.startsOn, locale), to: date(b.endsOn, locale) })
        : b.startsOn
          ? t("space.candidatures.decide.dateFrom", { from: date(b.startsOn, locale) })
          : null;
    const place = [b.location, b.remote ? t("space.candidatures.decide.remote") : null].filter(Boolean).join(" · ") || null;
    const pay =
      b.paid === false
        ? t("space.candidatures.decide.unpaid")
        : b.rateCents
          ? [usd(b.rateCents), b.unionStatus].filter(Boolean).join(" · ")
          : b.paid
            ? t("space.candidatures.decide.paid")
            : null;
    const source = b.sourceRef && hostOf(b.sourceRef) ? b.sourceRef : null;
    return {
      id: d.id,
      status: d.status,
      role: b.roleName,
      project: b.title,
      production: b.production,
      description: b.description,
      dates,
      location: place,
      pay,
      questions: sub.questions,
      videos: sub.videos,
      sourceUrl: source,
      sourceHost: source ? hostOf(source) : null,
    };
  });

  const rows: CandidatureRow[] = candidatures.map((c) => ({
    id: c.id,
    projectTitle: c.project.title,
    // Statuses are String columns validated by Zod at the domain boundary
    // (the house pattern). Narrowing here is what lets the label lookup be a
    // typed key rather than a cast.
    status: CandidatureStatus.catch("NEW").parse(c.status),
    source: c.source,
    score: c.matchScore?.score ?? null,
    reasons: parseJson(MatchReasons, c.matchScore?.reasons ?? null),
    rateEuros: c.estimatedRateCents ? c.estimatedRateCents / 100 : null,
    appliedAt: c.appliedAt.toISOString(),
    auto: c.source === "AGENTAL",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.candidatures.title")}</h1>
        <p className="text-fg-muted">
          {t("space.candidatures.subtitle")}
        </p>
      </div>
      <p className="rounded-sedan border border-border bg-surface-2/50 px-4 py-3 text-[15px]">
        {t("space.candidatures.queue.rule", { count: quota.limit, hours: SEARCH_SPACING_HOURS })}
      </p>

      <section id="search-queue" aria-labelledby="queue-title" className="scroll-mt-24 space-y-3">
        <h2 id="queue-title" className="font-display text-xl font-medium">
          {t("space.candidatures.queue.title")}
        </h2>
        {queued.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("space.candidatures.queue.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {queued.map((r, i) => {
              const h = hoursUntil(r.scheduledFor ?? r.createdAt, now);
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-4">
                  <Radar aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t("space.candidatures.queue.item", { n: i + 1 })}</p>
                    <p className="text-sm text-fg-muted">
                      {h === 0 ? t("space.candidatures.queue.soon") : t("space.candidatures.queue.startsIn", { hours: h })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="search-running" aria-labelledby="running-title" className="scroll-mt-24 space-y-3">
        <h2 id="running-title" className="font-display text-xl font-medium">
          {t("space.candidatures.running.title")}
        </h2>
        {running.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("space.candidatures.running.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {running.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-sedan border border-[var(--go)]/40 bg-surface p-4">
                <Radar aria-hidden="true" className="radar-sweep size-5 shrink-0 text-[var(--go)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t("space.candidatures.searches.running")}</p>
                  <p className="text-sm text-fg-muted">
                    {t("space.candidatures.searches.started", { date: dateTime(r.startedAt ?? r.createdAt, locale) })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="search-finished" aria-labelledby="finished-title" className="scroll-mt-24 space-y-3">
        <h2 id="finished-title" className="font-display text-xl font-medium">
          {t("space.candidatures.finished.title")}
        </h2>
        {finished.length > 0 && (
          <p className="text-sm text-fg-muted">
            {t("space.candidatures.finished.last", { date: dateTime(finished[0].completedAt ?? finished[0].createdAt, locale) })}
          </p>
        )}
        {found.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("space.candidatures.finished.empty")}</p>
        ) : (
          <ul className="space-y-4">
            {found.map((role) => (
              <FoundRoleCard key={role.id} role={role} />
            ))}
          </ul>
        )}
      </section>

      <CandidaturesList rows={rows} />
    </div>
  );
}
