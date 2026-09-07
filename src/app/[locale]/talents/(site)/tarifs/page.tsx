import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { TalentsPricingGrid } from "@/components/marketing/pricing-grids";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({
    locale,
    namespace: "talents.pricingPage",
  });
  return seo({
    locale,
    path: "/talents/tarifs",
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
  const t = useTranslations("talents.pricingPage");
  const tp = useTranslations("talents.pricing");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />
      <Section rhythm="major">
        <div className="mb-8 flex items-start gap-3 rounded-sedan-lg border border-border bg-accent-soft/50 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-fg-muted">{tp("note")}</p>
        </div>
        <TalentsPricingGrid />
        <p className="mt-8 font-mono text-[11px] text-fg-subtle">{t("note")}</p>
      </Section>
    </>
  );
}
