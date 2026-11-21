import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { CASTING_TYPES, formatCachet } from "@/data/casting-types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({
    locale,
    namespace: "talents.castingLandings",
  });
  return seo({
    locale,
    path: "/castings",
    title: t("index.meta.title"),
    description: t("index.meta.description"),
  });
}

export default async function CastingsIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return <IndexContent locale={locale} />;
}

function IndexContent({ locale }: { locale: string }) {
  const t = useTranslations("talents.castingLandings");
  // Copy now lives in messages; only structure and figures stay in the data file.
  const tt = useTranslations("talents.castingTypes");
  return (
    <>
      <PageHero
        eyebrow={t("index.eyebrow")}
        title={t("index.title")}
        subtitle={t("index.subtitle")}
      />
      <Section rhythm="major">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASTING_TYPES.map((type) => (
            <Link
              key={type.slug}
              href={`/castings/${type.slug}`}
              className="pressable group flex flex-col rounded-sedan-xl border border-border bg-surface p-[clamp(20px,3vw,26px)] hover:border-accent"
            >
              <h2 className="text-xl font-bold leading-tight tracking-[-0.01em]">
                {tt(`${type.slug}.name`)}
              </h2>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-fg-muted">
                {tt(`${type.slug}.tagline`)}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[13px] font-bold text-accent">
                {formatCachet(type, locale, tt("units.variable"))}{" "}
                {tt(`units.${type.cachetUnit}`)}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
