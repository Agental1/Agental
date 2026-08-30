import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageHero } from "@/components/marketing/page-hero";
import { CASTING_TYPES } from "@/data/casting-types";

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
  return { title: t("index.meta.title"), description: t("index.meta.description") };
}

export default async function CastingsIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return <IndexContent />;
}

function IndexContent() {
  const t = useTranslations("talents.castingLandings");
  return (
    <>
      <PageHero
        eyebrow={t("index.eyebrow")}
        title={t("index.title")}
        subtitle={t("index.subtitle")}
      />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASTING_TYPES.map((type) => (
            <Link
              key={type.slug}
              href={`/castings/${type.slug}`}
              className="group flex flex-col rounded-sedan border border-border bg-surface p-6 transition-colors hover:border-accent"
            >
              <h2 className="font-display text-xl font-medium">{type.name}</h2>
              <p className="mt-1.5 flex-1 text-sm text-fg-muted">
                {type.tagline}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                {type.cachet} {type.cachetUnit}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
