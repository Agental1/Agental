import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { TalentsPricingGrid } from "@/components/marketing/pricing-grids";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "talents.pricingPage.meta",
  });
  return { title: t("title"), description: t("description") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex items-start gap-3 rounded-sedan border border-border bg-accent-soft/50 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-fg-muted">{tp("note")}</p>
        </div>
        <TalentsPricingGrid />
      </section>
    </>
  );
}
