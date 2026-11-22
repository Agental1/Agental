import { toLocale } from "@/i18n/routing";
import { parseJson } from "@/domain/json";
import { MatchReasons } from "@/domain/match-reason";
import { CandidatureStatus } from "@/domain/enums";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Radar } from "lucide-react";
import { listMyRoleSearches } from "@/lib/role-search";
import { searchState } from "@/lib/admin/jobs";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
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

  const searches = await listMyRoleSearches(session.user.id, 5);
  // Roles found by the agents: drafts the performer reviews. Nothing is sent.
  const found = await prisma.applicationDraft.findMany({
    where: { profileId: profile.id, brief: { source: "n8n-beta-v2" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, status: true, note: true, createdAt: true, brief: { select: { title: true, roleName: true, sourceRef: true, location: true } } },
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
        {/* Round 8b: the dashboard's Status links land here (group 3 splits the searches into three sections). */}
        <span id="search-queue" />
        <span id="search-running" />
        <span id="search-finished" />
      </div>
      {searches.length > 0 && (
        <ul className="scroll-mt-24 space-y-2" aria-label={t("space.candidatures.searches.label")}>
          {searches.map((s) => {
            const state = searchState(s.status);
            const active = state === "queued" || state === "running";
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-sedan border bg-surface p-4",
                  active ? "border-[var(--go)]/40" : "border-border"
                )}
              >
                <Radar aria-hidden="true" className={cn("size-5 shrink-0", active ? "text-[var(--go)]" : "text-fg-muted")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`space.candidatures.searches.${state}`)}</p>
                  <p className="text-sm text-fg-muted">
                    {t("space.candidatures.searches.started", { date: dateTime(s.createdAt, locale) })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {found.length > 0 && (
        <section aria-labelledby="found-roles" className="space-y-3">
          <h2 id="found-roles" className="font-display text-xl font-medium">
            {t("space.candidatures.found.title")}
          </h2>
          <p className="text-sm text-fg-muted">{t("space.candidatures.found.body")}</p>
          <ul className="space-y-3">
            {found.map((d) => (
              <li key={d.id} className="rounded-sedan border border-border bg-surface p-4">
                <p className="font-medium">
                  {d.brief.roleName ? `${d.brief.roleName} · ` : ""}
                  {d.brief.title}
                </p>
                <p className="text-sm text-fg-muted">
                  {d.brief.location ? `${d.brief.location} · ` : ""}
                  {t(
                    `space.candidatures.found.status.${
                      d.status === "DRAFT" ? "draft" : d.status === "ACCEPTED" ? "accepted" : d.status === "SUBMITTED" ? "submitted" : "reviewed"
                    }`
                  )}
                </p>
                <Link href={`/talents/app/candidatures/${d.id}`} className="mr-4 text-sm font-bold text-accent hover:underline">
                  {t("space.candidatures.role.open")}
                </Link>
                {d.brief.sourceRef && (
                  <a href={d.brief.sourceRef} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-bold text-accent hover:underline">
                    {t("space.candidatures.found.source")} ({new URL(d.brief.sourceRef).hostname})
                  </a>
                )}
                {d.note && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-bold">{t("space.candidatures.found.draft")}</summary>
                    <p className="mt-2 whitespace-pre-wrap text-fg-muted">{d.note}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <CandidaturesList rows={rows} />
    </div>
  );
}
