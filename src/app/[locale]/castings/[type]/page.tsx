import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Users, Sparkles, ShieldCheck, Coins, ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHero } from "@/components/marketing/page-hero";
import {
  CASTING_TYPES,
  formatCachet,
  getCastingType,
  type CastingType,
} from "@/data/casting-types";
import { seo, jsonLd, serviceLd, breadcrumbLd } from "@/lib/seo";

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
      <TypeContent ct={ct} locale={locale} />
    </>
  );
}

function TypeContent({ ct, locale }: { ct: CastingType; locale: string }) {
  const t = useTranslations("talents.castingLandings");
  const tt = useTranslations("talents.castingTypes");
  const tm = useTranslations("talents.minors");
  const benefits = t.raw("benefits") as string[];
  const minorsItems = tm.raw("items") as string[];

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

      <div className="mx-auto max-w-3xl space-y-14 px-4 py-16 sm:px-6">
        <Block icon={Users} title={t("audienceTitle")}>
          <p className="text-lg leading-relaxed text-fg-muted">
            {tt(`${ct.slug}.audience`)}
          </p>
        </Block>

        <Block icon={Sparkles} title={t("benefitsTitle")}>
          <ul className="space-y-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="mt-1 size-4 shrink-0 text-success" />
                <span className="text-fg-muted">{b}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block icon={Coins} title={t("cachetsTitle")}>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-fg">
              {formatCachet(ct, locale, tt("units.variable"))}
            </span>
            <span className="text-fg-muted">{tt(`units.${ct.cachetUnit}`)}</span>
          </div>
          <p className="mt-2 text-sm text-fg-subtle">{t("cachetsNote")}</p>
        </Block>

        {ct.minors && (
          <Block icon={ShieldCheck} title={t("protectionTitle")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {minorsItems.map((m) => (
                <li
                  key={m}
                  className="flex items-start gap-2 rounded-sedan border border-border bg-surface p-3 text-sm"
                >
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <div className="rounded-sedan border border-border bg-surface-2/50 p-8 text-center">
          <h2 className="font-display text-2xl font-medium">
            {t("startTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-fg-muted">{t("startBody")}</p>
          <Button asChild size="lg" className="mt-5">
            <Link href="/talents/inscription">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="border-t border-border pt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t("othersTitle")}
          </h3>
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
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-sedan bg-accent-soft text-accent">
          <Icon className="size-5" />
        </span>
        <h2 className="font-display text-2xl font-medium">{title}</h2>
      </div>
      {children}
    </section>
  );
}
