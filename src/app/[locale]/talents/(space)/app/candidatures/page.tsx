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
import { hoursUntil, searchPaceFor, searchSpacingHoursFor } from "@/domain/role-search";
import { readSubmission } from "@/domain/application-response";
import { FoundRoleCard, type FoundRole } from "@/components/talents/found-role-card";
import { SearchStateTabs } from "@/components/app/search-state-tabs";
import { pickSearchView } from "@/domain/search-view";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const { view: askedView } = await searchParams;
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

  // Round 8b: three search states. Round 8d: the plan runs several searches at
  // once (slots); each queued search shows its expected start, from its
  // scheduled time.
  const now = new Date();
  const [searches, quota] = await Promise.all([
    listMyRoleSearches(session.user.id, 30),
    getRoleSearchQuota(session.user.id, now),
  ]);
  const queued = searches
    .filter((r) => r.status === "queued")
    .sort((a, b) => (a.scheduledFor ?? a.createdAt).getTime() - (b.scheduledFor ?? b.createdAt).getTime());
  const running = searches.filter((r) => r.status === "running");
  // Round 9: a failed search is shown for a week, so the performer knows it gave its place back.
  const failed = searches.filter(
    (r) => r.status === "failed" && now.getTime() - (r.completedAt ?? r.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
  );
  const finished = searches
    .filter((r) => r.status === "done")
    .sort((a, b) => (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime());

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

  // Round 8c: three buttons with counts; the finished count is the roles found
  // there (what the performer acts on).
  const counts = { queue: queued.length, running: running.length, finished: found.length };
  const view = pickSearchView(askedView, counts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.candidatures.title")}</h1>
        <p className="text-fg-muted">
          {t("space.candidatures.subtitle")}
        </p>
      </div>
      <p className="rounded-sedan border border-border bg-surface-2/50 px-4 py-3 text-[15px]">
        {t("space.candidatures.queue.rule", {
          count: quota.limit,
          slots: searchPaceFor(quota.plan).slots,
          hours: searchSpacingHoursFor(quota.plan),
        })}
        {" "}
        <span className="font-medium">
          {t("space.candidatures.queue.slotsInUse", { running: running.length, slots: searchPaceFor(quota.plan).slots })}
        </span>
      </p>

      <SearchStateTabs
        initial={view}
        counts={counts}
        panels={{
          queue: (
            <section id="search-queue" aria-label={t("space.candidatures.queue.title")} className="scroll-mt-24 space-y-3">
              {queued.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("space.candidatures.queue.empty")}</p>
        ) : (
          <>
          {/* Until the search engine is connected (round 9), nothing comes back: say so. */}
          <p className="text-[15px] font-medium">{t("space.candidatures.queue.queuedHonest")}</p>
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
                      {h > 0 && (
                        <>
                          {" · "}
                          {t("space.candidatures.queue.startsAt", { date: dateTime(r.scheduledFor ?? r.createdAt, locale) })}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
            </section>
          ),
          running: (
            <section id="search-running" aria-label={t("space.candidatures.running.title")} className="scroll-mt-24 space-y-3">
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
          ),
          finished: (
            <section id="search-finished" aria-label={t("space.candidatures.finished.title")} className="scroll-mt-24 space-y-3">
              {finished.length > 0 && (
          <p className="text-sm text-fg-muted">
            {t("space.candidatures.finished.last", { date: dateTime(finished[0].completedAt ?? finished[0].createdAt, locale) })}
          </p>
        )}
        {failed.length > 0 && (
          <ul className="space-y-2">
            {failed.map((r) => (
              <li key={r.id} role="status" className="rounded-sedan border border-danger/40 bg-danger/5 p-3 text-sm">
                {t("space.candidatures.searches.failed")}{" "}
                <span className="text-fg-muted">{dateTime(r.completedAt ?? r.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
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
          ),
        }}
      />

      <CandidaturesList rows={rows} />
    </div>
  );
}
