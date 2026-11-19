import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { LimelightBlock } from "@/components/marketing/limelight-block";
import { MarketingFooter } from "@/components/marketing/footer";
import { B2B_PLANS, B2C_PLANS } from "@/domain/pricing";
import { LIMELIGHT } from "@/domain/limelight";
import { formatPlanPrice } from "@/lib/plan-price";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Entry screen: the first screen gets people started.
 *
 * Above the fold, on desktop and on a phone: the wordmark, Sign in, one line
 * of copy and two tiles, the two largest things on the page. "I'm a
 * performer" wears the Talent theme and "I cast roles" the Casting theme;
 * each opens its audience page, which starts with the account card (create
 * an account or sign in).
 *
 * Below the fold, in this order: what Agental is, how it works (both sides
 * meeting at the booking), Limelight, a three-column pricing overview, and the
 * two choices once more.
 *
 * Signed-in visitors never see this page: src/proxy.ts sends them to
 * /[locale]/continuer, which picks their dashboard.
 */

const SECTION = "mx-auto w-full max-w-site px-[clamp(16px,3vw,40px)] py-[clamp(36px,4.5vw,64px)]";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "common" });
  return seo({
    locale,
    path: "/",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default function EntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(toLocale(locale));
  const t = useTranslations("common");
  const tt = useTranslations("talents.hero");
  const tc = useTranslations("casting.hero");
  const tl = useTranslations("talents.limelight");

  return (
    <main id="main" data-portal="talents" className="flex flex-col overflow-x-clip bg-bg text-fg">
      <div className="flex h-svh min-h-[540px] flex-col px-[clamp(12px,1.6vw,24px)] pb-[clamp(12px,1.6vw,24px)]">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3">
          <AgentalLogo />
          <div className="flex items-center gap-1">
            <LocaleSwitcher compact />
            <Button asChild variant="secondary" size="sm" className="h-10 border-border-strong px-5">
              <Link href="/connexion">{t("nav.signIn")}</Link>
            </Button>
          </div>
        </header>

        <h1 className="shrink-0 pb-[clamp(10px,1.4vw,20px)] text-[clamp(1.125rem,1.2vw+0.75rem,1.5rem)] leading-tight">
          {t("entry.line")}
        </h1>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-[clamp(10px,1.2vw,16px)] md:grid-cols-2 md:grid-rows-1">
          <Tile
            portal="talents"
            href="/talents"
            label={t("entry.talents")}
            body={tt("note")}
            action={t("entry.createTalents")}
          />
          <Tile
            portal="casting"
            href="/casting"
            label={t("entry.casting")}
            body={tc("note")}
            action={t("entry.createCasting")}
          />
        </div>
      </div>

      <What />
      <How />
      <section className={SECTION}>
        <LimelightBlock />
      </section>
      <PricingOverview locale={toLocale(locale)} />

      {/* The two choices again, so nobody has to scroll back up to start. */}
      <section aria-labelledby="final-title" className={SECTION}>
        <h2 id="final-title" className="display-md">
          {t("home.final.title")}
        </h2>
        <div className="mt-6 grid gap-[clamp(10px,1.2vw,16px)] md:grid-cols-2">
          <Tile
            compact
            portal="talents"
            href="/talents"
            label={t("entry.talents")}
            body={tt("note")}
            action={t("entry.createTalents")}
          />
          <Tile
            compact
            portal="casting"
            href="/casting"
            label={t("entry.casting")}
            body={tc("note")}
            action={t("entry.createCasting")}
          />
        </div>
      </section>

      <MarketingFooter
        home="/"
        nav={[
          { href: "/talents/comment-ca-marche", label: t("nav.how") },
          { href: "/castings", label: t("nav.castingTypes") },
          { href: `/talents/${LIMELIGHT.slug}`, label: tl("nav") },
          { href: "/talents/tarifs", label: t("nav.pricing") },
        ]}
      />
    </main>
  );
}

/**
 * One audience, one tile. The whole tile is the link; the pill inside names
 * what the click does and is part of the same link, so there is one target.
 */
function Tile({
  portal,
  href,
  label,
  body,
  action,
  compact = false,
}: {
  /** The repeat at the bottom of the page: shorter, same content. */
  compact?: boolean;
  portal: "talents" | "casting";
  href: string;
  label: string;
  body: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      data-portal={portal}
      className={cn(
        "pressable group flex min-h-0 flex-col justify-between overflow-hidden rounded-sedan-2xl border border-border p-[clamp(20px,3vw,44px)] text-fg [--hover-scale:1.015] [--press-scale:1.03] hover:z-10 focus-visible:z-10",
        compact && "min-h-[15rem] gap-8"
      )}
    >
      <span className="block">
        <span
          className={cn(
            "block font-bold leading-[0.98] tracking-[-0.035em]",
            compact ? "text-[clamp(1.75rem,3.2vw,3rem)]" : "text-[clamp(2.25rem,5.2vw,5rem)]"
          )}
        >
          {label}
        </span>
        <span className="mt-[clamp(8px,1vw,16px)] block max-w-[34ch] text-[clamp(0.9375rem,0.4vw+0.8rem,1.125rem)] text-fg-muted">
          {body}
        </span>
      </span>
      <span className="cta-fill inline-flex h-12 w-fit max-w-full items-center rounded-full px-6 text-[15.5px] font-bold transition-[background-position] duration-200 ease-out group-hover:[background-position:100%_50%] group-focus-visible:[background-position:100%_50%]">
        <span className="truncate">{action}</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ what -- */

function What() {
  const t = useTranslations("common.home.what");
  const facts = t.raw("facts") as { title: string; body: string }[];
  return (
    <section id="what" aria-labelledby="what-title" className={SECTION}>
      <div className="grid gap-x-[clamp(24px,4vw,64px)] gap-y-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <h2 id="what-title" className="display-md">
          {t("title")}
        </h2>
        <p className="max-w-[66ch] text-[clamp(1.0625rem,0.4vw+1rem,1.25rem)] leading-relaxed">
          {t("body")}
        </p>
      </div>
      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.title} className="rounded-sedan-lg border border-border bg-surface p-5">
            <dt className="text-[1.125rem] font-bold leading-snug">{fact.title}</dt>
            <dd className="mt-1 text-[15px] text-fg-muted">{fact.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------- how -- */

/**
 * Both sides on one view: the performer lane in the Talent theme, the casting
 * lane in the Casting theme, and the booking where they meet. The numbers stay
 * because each lane is a real sequence.
 */
function How() {
  const t = useTranslations("common.home.how");
  const lanes = [
    { portal: "talents", label: t("performer"), steps: t.raw("performerSteps") as string[], href: "/talents" },
    { portal: "casting", label: t("casting"), steps: t.raw("castingSteps") as string[], href: "/casting" },
  ] as const;
  return (
    <section id="how" aria-labelledby="how-title" className={SECTION}>
      <h2 id="how-title" className="display-md">
        {t("title")}
      </h2>
      <div className="mt-6 grid gap-[clamp(10px,1.2vw,16px)] lg:grid-cols-[1fr_minmax(13rem,17rem)]">
        <div className="grid gap-[clamp(10px,1.2vw,16px)]">
          {lanes.map((lane) => (
            <div
              key={lane.portal}
              data-portal={lane.portal}
              className="rounded-sedan-xl border border-border p-[clamp(16px,2vw,28px)] text-fg"
            >
              <h3 className="text-[1.125rem]">
                <Link href={lane.href} className="underline-offset-4 hover:underline">
                  {lane.label}
                </Link>
              </h3>
              <ol
                className={cn(
                  "mt-4 grid gap-2.5",
                  lane.steps.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"
                )}
              >
                {lane.steps.map((step, i) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-bold tabular-nums text-accent"
                    >
                      {i + 1}
                    </span>
                    <span className="font-bold leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="cta-fill flex flex-col justify-center rounded-sedan-xl p-[clamp(20px,2.4vw,32px)]">
          <p className="text-[clamp(1.5rem,1.6vw+1rem,2.25rem)] font-bold leading-tight tracking-[-0.02em]">
            {t("meet")}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-white/90">{t("meetBody")}</p>
        </div>
      </div>
      <p className="mt-4 text-[15px] text-fg-muted">
        <Link
          href={`/talents/${LIMELIGHT.slug}`}
          className="font-bold text-accent underline-offset-4 hover:underline"
        >
          {t("websites")}
        </Link>
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- pricing -- */

/** Three products, three columns; each links to its full pricing section. */
function PricingOverview({ locale }: { locale: string }) {
  const t = useTranslations("common.home.pricing");
  const tp = useTranslations("talents.pricing");
  const tcp = useTranslations("casting.pricing");
  const tl = useTranslations("talents.limelight.offers");
  const talentNames = (tp.raw("plans") as { name: string }[]).map((p) => p.name);
  const castingNames = (tcp.raw("plans") as { name: string }[]).map((p) => p.name);
  const usd = (amount: number) => formatPlanPrice(amount * 100, locale);

  const columns = [
    {
      title: t("talent"),
      href: "/talents/tarifs",
      link: t("talentLink"),
      lines: [
        { name: talentNames[0], price: formatPlanPrice(B2C_PLANS.FREE.priceCents, locale) },
        { name: talentNames[1], price: t("perMonth", { price: formatPlanPrice(B2C_PLANS.PRO.priceCents, locale) }) },
      ],
    },
    {
      title: t("casting"),
      href: "/casting/tarifs",
      link: t("castingLink"),
      lines: [
        { name: castingNames[0], price: formatPlanPrice(B2B_PLANS.FREE.priceCents, locale) },
        { name: castingNames[1], price: t("perSeat", { price: formatPlanPrice(B2B_PLANS.PRO.priceCents, locale) }) },
      ],
    },
    {
      title: t("websites"),
      href: `/talents/${LIMELIGHT.slug}#start`,
      link: t("websitesLink"),
      note: tl("websitesPro", { months: LIMELIGHT.includedProMonths }),
      lines: [
        { name: tl("essential.name"), price: t("oneTime", { price: usd(LIMELIGHT.plans.essential.priceUsd) }) },
        { name: tl("signature.name"), price: t("oneTime", { price: usd(LIMELIGHT.plans.signature.priceUsd) }) },
      ],
    },
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className={SECTION}>
      <h2 id="pricing-title" className="display-md">
        {t("title")}
      </h2>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {columns.map((col) => (
          <div key={col.title} className="flex flex-col rounded-sedan-xl border border-border bg-surface p-5">
            <h3 className="text-[1.25rem]">{col.title}</h3>
            <dl className="mt-4 flex-1 space-y-3">
              {col.lines.map((line) => (
                <div key={line.name} className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
                  <dt className="font-bold">{line.name}</dt>
                  <dd className="text-right text-fg-muted tabular-nums">{line.price}</dd>
                </div>
              ))}
            </dl>
            {"note" in col && <p className="mt-3 text-[14px] font-bold text-accent">{col.note}</p>}
            <Link
              href={col.href}
              className="mt-4 inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
            >
              {col.link}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
