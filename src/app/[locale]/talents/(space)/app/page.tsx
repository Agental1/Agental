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
  ImageIcon,
  Ruler,
  PenLine,
  ListChecks,
  Link as LinkIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WebsiteCard } from "@/components/talents/website-card";
import { LIMELIGHT } from "@/domain/limelight";
import { listMySites } from "@/lib/sites";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { nextMissingItem, profileGaps, scoreProfile, type ProfileGap } from "@/domain/completeness";
import { GAP_TAB, profileTabHref } from "@/domain/profile-tabs";
import { getSetupState } from "@/lib/setup";
import { getRoleSearchQuota } from "@/lib/role-search";
import { FindRolesButton } from "@/components/app/find-roles-button";
import { B2C_PLANS } from "@/domain/pricing";

const GAP_ICON: Record<ProfileGap, typeof UserCog> = {
  photos: ImageIcon,
  video: Video,
  physical: Ruler,
  bio: PenLine,
  links: LinkIcon,
};

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
  const gaps = profileGaps(completenessInput);
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

  // The "Complete your profile" card covers photos, video, physical details
  // and bio. These suggestions pick up what it does not list.
  const suggestions: { text: string; href: string; cta: string; icon: typeof UserCog }[] = [];
  // First suggestion: finish the profile while it is below 100%, then launch
  // the first research (the "Start finding roles" button).
  const nextItem = nextMissingItem(completenessInput);
  if (completeness < 100) {
    suggestions.push({
      text: nextItem
        ? t("space.dashboard.nextItem", {
            percent: completeness,
            item: t(`space.dashboard.missing.${nextItem}`),
          })
        : t("space.dashboard.completenessHint", { percent: completeness }),
      href: "/talents/app/profil",
      cta: t("space.dashboard.completeProfile.title"),
      icon: UserCog,
    });
  } else {
    suggestions.push({
      text: t("space.dashboard.launch.body"),
      href: "/talents/app#find-roles",
      cta: t("space.dashboard.launch.title"),
      icon: Sparkles,
    });
  }
  // A reel clears the card's video item; a self-tape is still worth asking for.
  if (
    !gaps.includes("video") &&
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
  // The sign-up basics (stage name, adult date of birth, a specialty). While
  // one is missing, a card names it and resumes the wizard there.
  const { nextStep } = await getSetupState(session.user.id);
  const quota = await getRoleSearchQuota(session.user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">
            {profile.stageName
              ? t("space.dashboard.welcome", { name: profile.stageName })
              : t("space.dashboard.welcomeAnon")}
          </h1>
          <p className="text-fg-muted">{t("space.dashboard.tagline")}</p>
        </div>
      </div>

      {nextStep && (
        <section
          aria-labelledby="complete-setup"
          className="flex flex-col gap-4 rounded-sedan border border-accent/40 bg-accent-soft/40 p-5 sm:flex-row sm:items-center"
        >
          <ListChecks aria-hidden="true" className="size-6 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 id="complete-setup" className="font-display text-xl font-medium">
              {t("space.dashboard.setup.title")}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t("space.dashboard.setup.subtitle")}</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">
                {t("space.dashboard.setup.next", { step: t(`onboarding.steps.${nextStep}`) })}
              </span>{" "}
              <span className="text-fg-muted">{t(`space.dashboard.setup.steps.${nextStep}`)}</span>
            </p>
          </div>
          <Button asChild className="self-start sm:self-center">
            <Link href="/talents/inscription">
              {t("space.dashboard.setup.cta")} <ArrowRight />
            </Link>
          </Button>
        </section>
      )}

      {!nextStep && gaps.length > 0 && (
        <section
          aria-labelledby="complete-profile"
          className="rounded-sedan border border-accent/40 bg-accent-soft/40 p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="complete-profile" className="font-display text-xl font-medium">
              {t("space.dashboard.completeProfile.title")}
            </h2>
            <span className="text-sm text-fg-muted">
              {t("space.dashboard.completeProfile.percent", { percent: completeness })}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {t("space.dashboard.completeProfile.subtitle")}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {gaps.map((gap) => {
              const Icon = GAP_ICON[gap];
              return (
                <li key={gap}>
                  <Link
                    href={profileTabHref(GAP_TAB[gap])}
                    className="flex min-h-11 items-center gap-3 rounded-sedan border border-border bg-surface p-3 text-sm transition-colors hover:border-accent"
                  >
                    <Icon className="size-4 shrink-0 text-accent" />
                    <span className="flex-1 font-medium">
                      {t(`space.dashboard.completeProfile.gaps.${gap}`)}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
      {!hasSite && <WebsiteCard href={`/talents/${LIMELIGHT.slug}`} appHref="/talents/app/site" />}
    </div>
  );
}
