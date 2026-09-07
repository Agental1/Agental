import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { useTranslations, useLocale } from "next-intl";
import { Users, Sparkles, ShieldCheck, Coins, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { InverseBand } from "@/components/marketing/inverse-band";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import {
  CASTING_TYPES,
  formatCachet,
  getCastingType,
  type CastingType,
} from "@/data/casting-types";
import { PORTRAITS } from "@/data/portraits";
import {
  seo,
  jsonLd,
  serviceLd,
  breadcrumbLd,
  faqPageLd,
  type FaqItem,
} from "@/lib/seo";

export function generateStaticParams() {
  return CASTING_TYPES.map((t) => ({ type: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale, type } = await params;
  const locale = toLocale(rawLocale);
  const ct = getCastingType(type);
  if (!ct) return {};
  const tt = await getTranslations({ locale, namespace: "talents.castingTypes" });
  return seo({
    locale,
    path: `/castings/${ct.slug}`,
    title: `${tt(`${ct.slug}.h1`)} — Agental Talents`,
    description: `${tt(`${ct.slug}.tagline`)} ${tt(`${ct.slug}.audience`)}`,
  });
}

export default async function CastingTypePage({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}) {
  const { locale: rawLocale, type } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const ct = getCastingType(type);
  if (!ct) notFound();
  const tt = await getTranslations({ locale, namespace: "talents.castingTypes" });
  const tl = await getTranslations({ locale, namespace: "talents.castingLandings" });
  const faq = tt.raw(`${ct.slug}.faq`) as FaqItem[];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            serviceLd({
              locale,
              path: `/castings/${ct.slug}`,
              name: tt(`${ct.slug}.h1`),
              description: tt(`${ct.slug}.tagline`),
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbLd(locale, [
              ["Agental", "/talents"],
              [tl("index.title"), "/castings"],
              [tt(`${ct.slug}.name`), `/castings/${ct.slug}`],
            ])
          ),
        }}
      />
      {/* Same source as the rendered accordion below: structured data that
          drifts from the visible page is a reason for Google to distrust the
          rest of the markup. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqPageLd(faq)) }}
      />
      <TypeContent ct={ct} locale={locale} />
    </>
  );
}

function TypeContent({ ct, locale }: { ct: CastingType; locale: string }) {
  const t = useTranslations("talents.castingLandings");
  const tt = useTranslations("talents.castingTypes");
  const tm = useTranslations("talents.minors");
  const tc = useTranslations("common");
  const activeLocale = toLocale(useLocale());
  const steps = tt.raw(`${ct.slug}.steps`) as string[];
  const faq = tt.raw(`${ct.slug}.faq`) as { q: string; a: string }[];
  const minorsItems = tm.raw("items") as string[];
  const portrait = PORTRAITS[activeLocale].ages[ct.ageBand];

  return (
    <>
      <PageHero
        eyebrow={t("index.eyebrow")}
        title={tt(`${ct.slug}.h1`)}
        subtitle={tt(`${ct.slug}.tagline`)}
      >
        <Button asChild size="lg">
          <Link href="/talents/inscription">
            {t("cta")} <ArrowRight />
          </Link>
        </Button>
      </PageHero>

      <Section width="prose" rhythm="major">
        <InverseBand align="left" className="flex items-start gap-6">
          {/* Illustrative, and the heading right beside it already names the
              type — so alt="" rather than a caption a screen reader would
              hear twice. */}
          <Image
            src={portrait}
            alt=""
            sizes="72px"
            className="hidden size-[72px] shrink-0 rounded-full object-cover sm:block"
          />
          <p className="text-[17px] leading-relaxed">
            {tt(`${ct.slug}.chapo`)}
          </p>
        </InverseBand>

        <div className="mt-14 space-y-14">
          <Block icon={Users} title={t("audienceTitle")}>
            <p className="text-[17px] leading-relaxed text-fg-muted">
              {tt(`${ct.slug}.audience`)}
            </p>
          </Block>

          <Block icon={Sparkles} title={t("benefitsTitle")}>
            <p className="text-[17px] leading-relaxed text-fg-muted">
              {tt(`${ct.slug}.apporte`)}
            </p>
          </Block>

          {ct.minors && (
            <Block icon={ShieldCheck} title={t("protectionTitle")}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {minorsItems.map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 rounded-sedan-lg border border-border bg-surface p-3 text-sm"
                  >
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-sedan-xl bg-surface-2 p-[clamp(20px,3vw,26px)]">
              <Eyebrow className="flex items-center gap-1.5">
                <Coins className="size-3.5" />
                {t("cachetsTitle")}
              </Eyebrow>
              <p className="mt-3 font-mono text-[26px] font-bold leading-none">
                {formatCachet(ct, locale, tt("units.variable"))}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {tt(`units.${ct.cachetUnit}`)}
              </p>
              <p className="mt-4 text-sm text-fg-subtle">{t("cachetsNote")}</p>
            </div>

            <div className="rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,26px)]">
              <Eyebrow>{t("startTitle")}</Eyebrow>
              <ol className="mt-4 space-y-3">
                {steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cta font-mono text-[11px] font-bold text-cta-fg">
                      {i + 1}
                    </span>
                    <span className="text-[15px] leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/talents/inscription">
                {t("cta")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              {/* common.nav.how, not the page eyebrow: "Types de casting" on a
                  button that goes to /comment-ca-marche said the wrong thing.
                  Reused rather than a tenth new key. */}
              <Link href="/talents/comment-ca-marche">{tc("nav.how")}</Link>
            </Button>
          </div>

          <div>
            <h2 className="mb-6 text-[clamp(24px,3.2vw,34px)] font-bold leading-[1.1] tracking-[-0.02em]">
              {t("faqTitle")}
            </h2>
            <FaqAccordion groups={[{ title: tt(`${ct.slug}.name`), items: faq }]} />
          </div>

          <div className="border-t border-border pt-8">
            <Eyebrow>{t("othersTitle")}</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              {CASTING_TYPES.filter((o) => o.slug !== ct.slug).map((o) => (
                <Link key={o.slug} href={`/castings/${o.slug}`}>
                  <Badge variant="neutral" className="hover:border-accent">
                    {tt(`${o.slug}.name`)}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-sedan bg-accent-soft text-accent">
          <Icon className="size-5" />
        </span>
        <h2 className="text-[clamp(22px,2.8vw,28px)] font-bold tracking-[-0.01em]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
