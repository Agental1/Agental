import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo, jsonLd, serviceLd } from "@/lib/seo";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { StepsOverview } from "@/components/marketing/steps-overview";
import { TalentsPricingGrid } from "@/components/marketing/pricing-grids";
import { LIMELIGHT } from "@/domain/limelight";

/**
 * Agental Talent landing: about three screens on a desktop.
 *
 *   1. What Agental is and the one way in ("Become a member"), with the three
 *      facts a performer checks before signing up right beside the button.
 *   2. The five steps to join, then a compact pointer to Limelight.
 *   3. The plans, compact, with details on expand.
 *
 * Everything else that used to live here (the reasons, the self-tape studio,
 * minors, the full commission table) is one click away on How it works, FAQ
 * and Pricing. There are no photos of people and no testimonials: the page
 * only states what is verifiably true today. Copy is the existing approved
 * copy from the message files.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return seo({
    locale,
    path: "/talents",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function TalentsLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: "/talents",
              name: t("meta.title"),
              description: t("meta.description"),
            })
          ),
        }}
      />
      <Hero />
      <StepsOverview portal="talents" className="pb-[clamp(28px,3.5vw,48px)]" />
      <LimelightTeaser />
      <Pricing />
    </>
  );
}

function Hero() {
  const t = useTranslations("talents.hero");
  const tp = useTranslations("talents.proof");
  const facts = (["regulated", "ai", "free"] as const).map((key) => ({
    title: tp(`${key}.title`),
    body: tp(`${key}.body`),
  }));

  return (
    <section
      data-demo="talents-hero"
      className="mx-auto max-w-site px-[clamp(16px,3vw,40px)] pb-[clamp(40px,5vw,72px)] pt-[clamp(40px,6vw,88px)]"
    >
      <div className="grid gap-[clamp(32px,5vw,72px)] lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <h1 className="display-xl max-w-[14ch]">
            {t("title")} {t("titleEmph")}
          </h1>
          <div className="mt-[clamp(24px,3vw,40px)] flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button asChild size="lg">
              <Link href="/talents/inscription">{t("ctaPrimary")}</Link>
            </Button>
            <p className="text-[14.5px] text-fg-muted">{t("note")}</p>
          </div>
        </div>

        {/* The three things a performer checks before signing up. */}
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:gap-5">
          {facts.map((fact) => (
            <div key={fact.title} className="border-l-2 border-accent pl-4">
              <dt className="font-bold leading-snug">{fact.title}</dt>
              <dd className="mt-0.5 text-[15px] leading-snug text-fg-muted">{fact.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** A compact pointer to Limelight, high on the page. The whole band is the link. */
function LimelightTeaser() {
  const t = useTranslations("talents.limelight.band");
  return (
    <section className="mx-auto max-w-site px-[clamp(16px,3vw,40px)]">
      <Link
        href={`/talents/${LIMELIGHT.slug}`}
        className="pressable accent-wash flex flex-col gap-4 rounded-sedan-xl border border-accent bg-surface p-[clamp(20px,2.4vw,28px)] [--hover-scale:1.015] [--press-scale:1.03] md:flex-row md:items-center md:justify-between md:gap-8"
      >
        <span className="block">
          <span className="block text-[1.25rem] font-bold leading-snug">{t("title")}</span>
          <span className="mt-1 block max-w-[70ch] text-[15px] text-fg-muted">{t("body")}</span>
        </span>
        <span className="inline-flex h-11 shrink-0 items-center self-start rounded-full border border-border-strong bg-surface px-5 text-[15px] font-bold md:self-auto">
          {t("cta")}
        </span>
      </Link>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("talents.pricing");
  return (
    <section
      id="tarifs"
      aria-labelledby="pricing-title"
      className="mx-auto max-w-site scroll-mt-24 px-[clamp(16px,3vw,40px)] py-[clamp(48px,6vw,88px)]"
    >
      <h2 id="pricing-title" className="display-md max-w-[22ch]">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-[70ch] text-fg-muted">{t("note")}</p>
      <div className="mt-6">
        <TalentsPricingGrid />
      </div>
    </section>
  );
}
