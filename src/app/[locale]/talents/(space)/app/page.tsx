import { Suspense } from "react";
import { toLocale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Send,
  Clock,
  CalendarCheck,
  Sparkles,
  ArrowRight,
  UserCog,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WebsiteCard } from "@/components/talents/website-card";
import { listMySites } from "@/lib/sites";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { missingItems, scoreProfile } from "@/domain/completeness";
import { itemHref } from "@/domain/profile-tabs";
import { Progress } from "@/components/ui/progress";
import { getRoleSearchQuota } from "@/lib/role-search";
import { recentFirstAutoSearch } from "@/lib/auto-search";
import { FindRolesButton } from "@/components/app/find-roles-button";
import { WelcomeTour, type WelcomeStep } from "@/components/app/welcome-tour";

const CANDIDATURE_STATUSES = [
  "NEW",
  "SHORTLISTED",
  "STARRED",
  "EXCLUDED",
  "SELFTAPE_REQUESTED",
  "INVITED",
  "CONTRACTED",
  "REJECTED",
] as const;
function isCandidatureStatus(v: string): v is (typeof CANDIDATURE_STATUSES)[number] {
  return (CANDIDATURE_STATUSES as readonly string[]).includes(v);
}

export default async function TalentsDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  const ta = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      candidatures: { include: { project: true, matchScore: true } },
      media: true,
      _count: { select: { specialties: true } },
    },
  });
  if (!profile) return null;

  // Scored here rather than read from completenessScore, so the card and the
  // percentage cannot disagree, even on rows scored by the old rule.
  const completenessInput = {
    stageName: profile.stageName,
    birthDate: profile.birthDate,
    city: profile.city,
    bio: profile.bio,
    physical: parseJson(PhysicalTraits, profile.physical),
    specialtiesCount: profile._count.specialties,
    media: profile.media,
    imdbUrl: profile.imdbUrl,
    portfolioUrl: profile.portfolioUrl,
  };
  const completeness = scoreProfile(completenessInput);

  const cands = profile.candidatures;
  const active = cands.filter((c) =>
    ["NEW", "SHORTLISTED", "SELFTAPE_REQUESTED"].includes(c.status)
  ).length;
  const shortlisted = cands.filter((c) =>
    ["SHORTLISTED", "STARRED", "INVITED"].includes(c.status)
  ).length;
  const invited = cands.filter((c) => c.status === "INVITED").length;
  const urgent = cands.filter(
    (c) => (c.matchScore?.score ?? 0) >= 90 && c.status === "SHORTLISTED"
  ).length;

  // Every label below already existed under space.dashboard, translated in the
  // three locales, with no caller. It was written and never wired up.
  const kpis = [
    { label: t("space.dashboard.activeCount"), value: active, icon: Send },
    { label: t("space.dashboard.pendingCount"), value: shortlisted, icon: Clock },
    { label: t("space.dashboard.auditions"), value: invited, icon: CalendarCheck },
    { label: t("space.dashboard.urgent"), value: urgent, icon: Sparkles },
  ];

  // One list of what is missing, from the same rule as the percentage (see
  // missingItems). The block shows the first item; the suggestions below link
  // the next ones. Every link opens the tab and the field to fill.
  const missing = missingItems(completenessInput);
  const nextItem = missing[0] ?? null;
  const suggestions: { text: string; href: string; cta: string; icon: typeof UserCog }[] = missing
    .slice(1, 4)
    .map((item) => ({
      text: t(`space.dashboard.why.${item}`),
      href: itemHref(item),
      cta: t(`space.dashboard.action.${item}`),
      icon: UserCog,
    }));
  const searchedOnce = (await prisma.roleSearchRequest.count({ where: { userId: session.user.id } })) > 0;
  // Once the profile is at 100%: launch the first search, then check the applications.
  const nextAction = !searchedOnce
    ? { title: t("space.dashboard.launch.title"), text: t("space.dashboard.launch.body"), href: "/talents/app#find-roles", icon: Sparkles }
    : { title: t("space.dashboard.checkApplications.title"), text: t("space.dashboard.checkApplications.body"), href: "/talents/app/candidatures", icon: Send };
  // A reel clears the profile's video item; a self-tape is still worth asking
  // for, but only once nothing is missing, and only when none exists.
  if (
    missing.length === 0 &&
    profile.media.filter((m) => m.type === "SELFTAPE").length === 0
  )
    suggestions.push({
      text: t("space.dashboard.selftapeHint"),
      href: "/talents/app/reel-self-tape",
      cta: t("space.selftape.title"),
      icon: Video,
    });
  if (urgent > 0)
    suggestions.push({
      text: t("space.dashboard.urgentHint", { count: urgent }),
      href: "/talents/app/candidatures",
      cta: t("space.dashboard.view"),
      icon: Sparkles,
    });

  const hasSite = (await listMySites(session.user.id)).length > 0;
  const quota = await getRoleSearchQuota(session.user.id);
  // The first search started on its own: say so for two weeks.
  const showAutoFirst = await recentFirstAutoSearch(session.user.id);

  // The three-step welcome (shown on ?welcome=1). Each step names the real
  // element it outlines. Google accounts see what was filled for them.
  const tc = await getTranslations({ locale, namespace: "common" });
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, image: true, accounts: { select: { provider: true } } },
  });
  const fromGoogle = !!account?.accounts.some((a) => a.provider === "google");
  const welcomeSteps: WelcomeStep[] = [
    {
      title: tc("tour.w1.title"),
      body: nextItem
        ? tc("tour.w1.body", { percent: completeness, item: t(`space.dashboard.missing.${nextItem}`) })
        : tc("tour.w1.bodyDone", { percent: completeness }),
      notes: fromGoogle
        ? [tc("tour.w1.fromGoogle", { name: profile.stageName || "-", email: account?.email ?? "" })]
        : undefined,
      targets: ['[data-tour="profile"]'],
      fallback: '[data-tour="profile-fallback"]',
    },
    {
      title: tc("tour.w2.title"),
      body: tc("tour.w2.body", { count: quota.limit }),
      targets: ["#find-roles"],
    },
    {
      title: tc("tour.w3.title"),
      body: tc("tour.w3.body"),
      targets: ['a[data-nav="/talents/app/candidatures"]', 'a[data-nav="/talents/app/messages"]'],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 data-tour="profile-fallback" className="font-display text-3xl font-medium">
            {profile.stageName
              ? t("space.dashboard.welcome", { name: profile.stageName })
              : t("space.dashboard.welcomeAnon")}
          </h1>
          <p className="text-fg-muted">{t("space.dashboard.tagline")}</p>
        </div>
      </div>

      {nextItem ? (
        // The one profile block: the percentage, the next missing item and a
        // button that opens the exact field.
        <section
          data-tour="profile"
          aria-labelledby="complete-profile"
          className="flex flex-col gap-4 rounded-sedan border border-accent/40 bg-accent-soft/40 p-5 sm:flex-row sm:items-center"
        >
          <UserCog aria-hidden="true" className="size-6 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="complete-profile" className="font-display text-xl font-medium">
                {t("space.dashboard.completeProfile.title")}
              </h2>
              <span className="text-sm font-medium text-fg-muted">
                {t("space.dashboard.completeProfile.percent", { percent: completeness })}
              </span>
            </div>
            <Progress value={completeness} aria-label={t("space.dashboard.completeProfile.title")} className="mt-3" />
            <p className="mt-3 text-sm">
              <span className="font-medium">{t("space.dashboard.completeProfile.next")}</span>{" "}
              <span className="text-fg-muted">{t(`space.dashboard.action.${nextItem}`)}</span>
            </p>
          </div>
          <Button asChild className="self-start sm:self-center">
            <Link href={itemHref(nextItem)}>
              {t("space.dashboard.completeProfile.cta")} <ArrowRight />
            </Link>
          </Button>
        </section>
      ) : (
        <Link
          href={nextAction.href}
          data-tour="profile"
          className="pressable flex items-center gap-4 rounded-sedan border border-accent/40 bg-surface p-5 [--hover-scale:1.01] [--press-scale:0.99]"
        >
          <nextAction.icon aria-hidden="true" className="size-6 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold uppercase tracking-wide text-accent">{t("space.dashboard.nextAction")}</span>
            <span className="block font-display text-xl font-medium">{nextAction.title}</span>
            <span className="block text-sm text-fg-muted">{nextAction.text}</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-fg-subtle" />
        </Link>
      )}

      {showAutoFirst && (
        <p role="status" className="flex items-center gap-3 rounded-sedan border border-[var(--go)]/40 bg-surface p-4 text-sm">
          <Sparkles aria-hidden="true" className="size-5 shrink-0 text-[var(--go)]" />
          <span>{t("space.dashboard.autoFirst", { left: quota.remaining, limit: quota.limit })}</span>
        </p>
      )}

      <Suspense fallback={null}>
        <WelcomeTour
          steps={welcomeSteps}
          offerPhoto={fromGoogle && !profile.avatarKey && !!account?.image}
        />
      </Suspense>

      <FindRolesButton
        initialQuota={quota}
        upgradeHref="/talents/app/abonnement"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-sedan border border-border bg-surface p-5"
          >
            <k.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-3xl">{k.value}</p>
            <p className="text-sm text-fg-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium">
            {t("space.dashboard.recent")}
          </h2>
          {cands.length === 0 ? (
            <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-6 text-sm text-fg-muted">{t("space.dashboard.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {cands.slice(0, 4).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-3"
                >
                  {c.matchScore && (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-accent font-display text-sm text-accent">
                      {c.matchScore.score}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.project.title}
                  </span>
                  <Badge variant="accent">
                    {isCandidatureStatus(c.status) ? ta(`candidatureStatus.${c.status}`) : c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-medium">
            <Sparkles className="size-5 text-accent" /> {t("space.dashboard.suggestions")}
          </h2>
          <div className="space-y-2">
            {suggestions.length === 0 && <p className="text-sm text-fg-muted">{t("space.dashboard.noSuggestions")}</p>}
            {suggestions.map((s) => (
              <div
                key={s.cta}
                className="rounded-sedan border border-border bg-surface p-4"
              >
                <p className="text-sm text-fg-muted">{s.text}</p>
                <Button asChild variant="link" size="sm" className="mt-1 px-0">
                  <Link href={s.href}>
                    {s.cta} <ArrowRight />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Last on the page, so the status, the figures and the AI suggestions
          keep their place. */}
      {/* Stays in the app: the public Limelight page is static and its header
          always offers "Sign in", which read as being signed out. The app's
          Website page has the request form. */}
      {!hasSite && <WebsiteCard href="/talents/app/abonnement#limelight" appHref="/talents/app/abonnement#limelight" />}
    </div>
  );
}
