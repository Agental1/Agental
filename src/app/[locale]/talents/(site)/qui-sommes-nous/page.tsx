import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { BETA } from "@/data/beta";
import { InverseBand } from "@/components/marketing/inverse-band";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "talents.about" });
  return seo({
    locale,
    path: "/talents/qui-sommes-nous",
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
  return <AboutContent />;
}

function AboutContent() {
  const t = useTranslations("talents.about");
  const tb = useTranslations("common");

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      {/* The story sits on a soft band so it reads as its own chapter; the
          sections after it share one rhythm, split by a thin rule. */}
      <Section width="prose" rhythm="compact" tone="band">
        <h2 className="text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {t("origin.title")}
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
          {t("origin.body")}
        </p>
        <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
          {t("origin.body2")}
        </p>
      </Section>

      <Section width="prose" rhythm="compact">
        <h2 className="text-[clamp(24px,3.2vw,38px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {t("stance.title")}
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-fg-muted">
          {t("stance.body")}
        </p>
      </Section>

      <Section width="prose" rhythm="none" innerClassName="pb-[clamp(40px,5vw,72px)]">
        <hr className="mb-[clamp(28px,3.5vw,48px)] border-border" />
        <InverseBand>
          <h2 className="text-[clamp(22px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.02em]">
            {t("mission.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-[58ch] leading-relaxed text-fg-inverse-muted">
            {t("mission.body")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/talents#account">
                {t("mission.ctaPrimary")} <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="border-border-inverse bg-transparent text-fg-inverse hover:bg-fg-inverse/10"
            >
              <Link href="/casting">{t("mission.ctaSecondary")}</Link>
            </Button>
          </div>
        </InverseBand>
      </Section>
      {BETA.agental && (
        <p className="mx-auto max-w-[51rem] px-[clamp(16px,3vw,40px)] pb-10 text-[13.5px] text-fg-subtle">
          {tb("beta.agental")}
        </p>
      )}
    </>
  );
}
