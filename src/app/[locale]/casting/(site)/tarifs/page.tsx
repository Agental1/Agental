import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { CastingPricingGrid } from "@/components/marketing/pricing-grids";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({
    locale,
    namespace: "casting.pricingPage",
  });
  return seo({
    locale,
    path: "/casting/tarifs",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  return <TarifsContent />;
}

function TarifsContent() {
  const t = useTranslations("casting.pricingPage");
  const tp = useTranslations("casting.pricing");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <Section rhythm="major">
        <CastingPricingGrid expanded />
        <p className="mt-6 text-sm text-fg-subtle">{tp("note")}</p>
      </Section>
    </>
  );
}
